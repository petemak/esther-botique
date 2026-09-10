(ns house-of-esther.admin.images
  "A4 — image ingest. Re-encodes on upload to meet the per-image size budget
   (engineering-standards, non-negotiable): full <= ~300 KB / <= ~2000px,
   thumb <= ~60 KB / <= ~800px, EXIF stripped. Rejects non-images and files
   over ~15 MB at the boundary.

   Ingest re-encodes to JPEG within the budget (no WebP variant is produced
   today — that's a deferred enhancement). The re-encoded bytes are written to
   S3-compatible object storage (Cloudflare R2) via `house-of-esther.media`;
   when `MEDIA_S3_ENDPOINT` is unset the sink falls back to a local-disk write
   (dev / offline / tests).

   `ingest-file!` is the shared re-encode + store + `images`-row path, reused by
   the A17 bulk-import commit (`house-of-esther.admin.product-import`)."
  (:require [clojure.string :as str]
            [house-of-esther.obs :as obs]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.media :as media]
            [house-of-esther.util :as u])
  (:import [java.awt Image]
           [java.awt.image BufferedImage]
           [java.io ByteArrayOutputStream]
           [javax.imageio ImageIO IIOImage ImageWriteParam]
           [javax.imageio.stream MemoryCacheImageOutputStream]))

(def ^:private max-upload-bytes (* 15 1024 1024))

(defn- scaled ^BufferedImage [^BufferedImage src max-dim]
  (let [w (.getWidth src) h (.getHeight src)
        r (min 1.0 (/ (double max-dim) (double (max w h))))
        nw (max 1 (int (Math/round (* w r)))) nh (max 1 (int (Math/round (* h r))))
        out (BufferedImage. nw nh BufferedImage/TYPE_INT_RGB)
        g (.createGraphics out)]
    (.drawImage g (.getScaledInstance src nw nh Image/SCALE_SMOOTH) 0 0 nil)
    (.dispose g)
    out))

(defn- jpeg-bytes ^bytes [^BufferedImage img quality]
  (let [writer (.next (ImageIO/getImageWritersByFormatName "jpeg"))
        baos   (ByteArrayOutputStream.)
        ios    (MemoryCacheImageOutputStream. baos)
        param  (doto (.getDefaultWriteParam writer)
                 (.setCompressionMode ImageWriteParam/MODE_EXPLICIT)
                 (.setCompressionQuality (float quality)))]
    (.setOutput writer ios)
    (.write writer nil (IIOImage. img nil nil) param)
    (.flush ios) (.dispose writer)
    (.toByteArray baos)))

(defn encode-within-budget
  "Re-encode `src` to <= max-dim px and <= budget bytes, dropping quality then
   dimension until it fits. Returns {:bytes ba :width :height}."
  [^BufferedImage src max-dim budget]
  (loop [dim max-dim]
    (let [img (scaled src dim)
          fit (some (fn [q]
                      (let [b (jpeg-bytes img q)]
                        (when (<= (alength b) budget) {:bytes b :width (.getWidth img) :height (.getHeight img)})))
                    [0.82 0.72 0.62 0.5 0.4])]
      (cond
        fit fit
        (> dim 400) (recur (int (* dim 0.8)))
        :else (let [b (jpeg-bytes img 0.4)]
                {:bytes b :width (.getWidth img) :height (.getHeight img)})))))

(defn- store! [id suffix ^bytes ba]
  (media/store-rendition! id suffix ba))

(defn ingest-file!
  "Re-encode `src-file` to both budget renditions, store them (R2 or local
   fallback), insert one `images` row, and return an `ImageRef`-shaped map
   `{:id :alt :thumbUrl :fullUrl :width :height :thumbBytes :fullBytes}`.
   Throws `ex-info` with `{:reason :decode}` for an unreadable file; storage /
   encode failures propagate as their underlying exception. Caller-agnostic:
   used by `upload` and by the A17 import commit."
  [^java.io.File src-file alt]
  (let [src (try (ImageIO/read src-file) (catch Exception _ nil))]
    (when-not src
      (throw (ex-info "We couldn't read that image." {:reason :decode})))
    (let [id        (u/prefixed-id "img")
          full      (encode-within-budget src 2000 (* 300 1024))
          thumb     (encode-within-budget src 800 (* 60 1024))
          full-url  (store! id "2000" (:bytes full))
          thumb-url (store! id "800" (:bytes thumb))
          tb        (alength ^bytes (:bytes thumb))
          fb        (alength ^bytes (:bytes full))]
      (db/with-tx [conn]
        (db/exec! conn ["insert into images (id, alt, thumb_url, full_url, width, height, thumb_bytes, full_bytes)
                         values (?,?,?,?,?,?,?,?)"
                        id (or alt "") thumb-url full-url (:width full) (:height full) tb fb])
        (obs/infow "image.ingested" :id id :fullBytes fb :thumbBytes tb))
      {:id id :alt (or alt "")
       :thumbUrl thumb-url :fullUrl full-url
       :width (:width full) :height (:height full)
       :thumbBytes tb :fullBytes fb})))

(defn upload [{:keys [multipart-params]}]
  (let [file (get multipart-params "file")
        alt  (or (get multipart-params "alt") "")]
    (when-not (and file (:tempfile file))
      (throw (err/validation "Attach an image file." [{:field "file" :message "required"}])))
    (when (> (long (:size file)) max-upload-bytes)
      (throw (err/validation "That image is over the 15 MB limit." [{:field "file" :message "too large"}])))
    (when-not (some-> (:content-type file) (str/starts-with? "image/"))
      (throw (err/validation "That file isn't an image." [{:field "file" :message "unsupported type"}])))
    (let [ref (try (ingest-file! (:tempfile file) alt)
                   (catch clojure.lang.ExceptionInfo e
                     (if (= :decode (:reason (ex-data e)))
                       (throw (err/validation "We couldn't read that image."
                                              [{:field "file" :message "decode failed"}]))
                       (throw e))))]
      (resp/created (assoc ref :isPrimary false)))))

(defn delete-image [{{:keys [id]} :path-params}]
  (db/with-tx [conn]
    (when (db/q1 conn ["select 1 from products where image_ids @> to_jsonb(?::text) or primary_image_id = ?" id id])
      (throw (err/conflict "conflict" "That image is still used by a product." nil)))
    (db/exec! conn ["delete from images where id = ?" id]))
  ;; best-effort object cleanup — never blocks the DB delete
  (media/delete-renditions! id)
  resp/no-content)

(def routes
  [["/images" {:post upload}]
   ["/images/:id" {:delete delete-image}]])
