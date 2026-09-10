(ns house-of-esther.media
  "Object-storage sink for re-encoded image bytes — admin uploads
   (`POST /api/admin/images`) and A17 bulk-import photos (`/import/commit`).

   When `MEDIA_S3_ENDPOINT` is configured the bytes are PUT to an S3-compatible
   bucket (Cloudflare R2) and served from `MEDIA_BASE_URL`; the application
   origin never streams image bytes for public traffic (engineering-standards:
   static assets from the CDN edge, not proxied through the origin).

   When `MEDIA_S3_ENDPOINT` is absent the sink falls back to the pre-R2
   local-disk write and returns `{CDN_BASE_URL}/p/...` — so `clojure -X:run`
   and the test suite run offline. This fallback is dev-only.

   Seed images are unchanged: they stay served from `CDN_BASE_URL` (Netlify
   `/seed/`). Only admin-uploaded and bulk-imported images go to R2. This split
   is the documented interim state."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [cognitect.aws.client.api :as aws]
            [cognitect.aws.credentials :as credentials]
            [house-of-esther.obs :as obs]
            [house-of-esther.runtime :as runtime]))

(defn- cfg [] (or (runtime/config :media) {}))

(defn r2-configured?
  "True when the R2 sink is wired (MEDIA_S3_ENDPOINT present)."
  []
  (not (str/blank? (:s3-endpoint (cfg)))))

;; --- S3 client -----------------------------------------------------------

(defn- endpoint-override [endpoint]
  (let [u (java.net.URI. endpoint)
        port (.getPort u)]
    (cond-> {:protocol (keyword (or (.getScheme u) "https"))
             :hostname (.getHost u)}
      (pos? port) (assoc :port port))))

(defonce ^:private client-cache (atom nil))

(defn- s3-client
  "Lazily build and cache the aws-api S3 client for R2. Notes on the recipe:

   - `:region` must be a REAL AWS region. aws-api resolves the base endpoint
     from `endpoints.edn` keyed by region and only THEN merges
     `:endpoint-override`; an unknown region (`\"auto\"`) makes resolution
     return `{:cognitect.anomalies/category :fault :message \"No known
     endpoint.\"}` before any request is made. R2 accepts `us-east-1` (and
     `auto`) in the SigV4 credential scope, so we sign as `us-east-1`.
   - `:endpoint-override` points the client at the R2 account host. aws-api's
     S3 requestUri is `/{Bucket}/{Key+}`, i.e. path-style — exactly what R2
     wants. No virtual-host rewriting needed.
   - aws-api signs classic SigV4 with an `x-amz-content-sha256` header over the
     full body (no aws-chunked / flexible-checksum trailers), which R2 accepts.
   - HTTP client: aws-api 0.8.x uses the JDK `java.net.http` client on JDK 11+;
     no extra `com.cognitect.aws/http-client` dependency required.

   Overridable in tests together with `*invoke*`."
  []
  (or @client-cache
      (let [{:keys [s3-endpoint s3-access-key-id s3-secret-access-key s3-region]} (cfg)
            c (aws/client
               {:api :s3
                :region (or (not-empty s3-region) "us-east-1")
                :endpoint-override (endpoint-override s3-endpoint)
                :credentials-provider
                (credentials/basic-credentials-provider
                 {:access-key-id     s3-access-key-id
                  :secret-access-key s3-secret-access-key})})]
        (reset! client-cache c)
        c)))

(defn reset-client!
  "Drop the cached S3 client (config changed, or a test wants a clean slate)."
  []
  (reset! client-cache nil))

(defn ^:dynamic *invoke*
  "Seam for tests. Default performs a real aws-api invoke against the R2 client.
   Rebind to `(fn [op request] -> response-map)` to assert calls without a
   network or credentials."
  [op request]
  (aws/invoke (s3-client) {:op op :request request}))

(defn- anomaly-detail
  "Pull the useful bits out of an aws-api anomaly / error response for logging
   and for the thrown ex-info."
  [res]
  {:anomaly  (:cognitect.anomalies/category res)
   :awsCode  (:cognitect.aws.error/code res)
   :message  (or (:cognitect.anomalies/message res)
                 (:message res) (:Message res)
                 (get-in res [:ErrorResponse :Message])
                 (get-in res [:Error :Message]))
   :status   (:cognitect.aws.http/status res)})

(defn- put-object! [obj-key ^bytes ba]
  (let [res (*invoke* :PutObject {:Bucket (:s3-bucket (cfg))
                                  :Key obj-key
                                  :Body ba
                                  :ContentType "image/jpeg"})]
    (when (:cognitect.anomalies/category res)
      (let [d (anomaly-detail res)]
        (obs/errorw "media.put-object.failed"
                    :key obj-key :anomaly (:anomaly d) :awsCode (:awsCode d)
                    :message (:message d) :status (:status d))
        (throw (ex-info "R2 PutObject failed" (assoc d :key obj-key)))))
    res))

;; --- public API --------------------------------------------------------

(defn obj-key
  "Bucket key for one rendition: p/{id}-{suffix}.jpg"
  [id suffix]
  (str "p/" id "-" suffix ".jpg"))

(defn store-rendition!
  "Persist one re-encoded JPEG rendition and return its public URL.

   R2 configured  -> PutObject p/{id}-{suffix}.jpg (ContentType image/jpeg),
                     URL = {MEDIA_BASE_URL}/p/{id}-{suffix}.jpg
   not configured -> local-disk write under UPLOAD_DIR,
                     URL = {CDN_BASE_URL}/p/{id}-{suffix}.jpg"
  [id suffix ^bytes ba]
  (let [k (obj-key id suffix)]
    (if (r2-configured?)
      (do
        (put-object! k ba)
        (str (str/replace (or (:base-url (cfg)) "") #"/+$" "") "/" k))
      (let [dir (io/file (or (runtime/config :upload-dir) "target/uploads"))
            f   (io/file dir (str id "-" suffix ".jpg"))]
        (.mkdirs dir)
        (with-open [o (io/output-stream f)] (.write o ba))
        (str (runtime/config :cdn-base-url) "/p/" id "-" suffix ".jpg")))))

(defn delete-renditions!
  "Best-effort delete of the two R2 objects for an image id (2000 + 800).
   Never throws — logs on failure so the caller's DB delete still succeeds.
   No-op when R2 is not configured (local fallback leaves files in place, as
   the pre-R2 milestone did)."
  [id]
  (when (r2-configured?)
    (doseq [suffix ["2000" "800"]]
      (let [k (obj-key id suffix)]
        (try
          (let [res (*invoke* :DeleteObject {:Bucket (:s3-bucket (cfg)) :Key k})]
            (when (:cognitect.anomalies/category res)
              (let [d (anomaly-detail res)]
                (obs/warnw "media.delete-object.failed"
                           :key k :anomaly (:anomaly d) :awsCode (:awsCode d)
                           :message (:message d) :status (:status d)))))
          (catch Exception e
            (obs/warnw "media.delete-object.failed" :key k :error (.getMessage e))))))))
