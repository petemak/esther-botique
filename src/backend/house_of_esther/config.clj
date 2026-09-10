(ns house-of-esther.config
  "Runtime configuration. Every value comes from an environment variable —
   nothing sensitive is hardcoded (engineering-standards: no hardcoded secrets)."
  (:require [clojure.string :as str]))

(defn- env
  ([k] (env k nil))
  ([k default]
   (let [v (System/getenv k)]
     (if (str/blank? v) default v))))

(defn- env-int [k default]
  (if-let [v (env k)] (Long/parseLong v) default))

(defn- env-bool [k default]
  (if-let [v (env k)] (contains? #{"1" "true" "yes"} (str/lower-case v)) default))

(defn load-config []
  {:port            (env-int "PORT" 3000)
   :app-base-url    (env "APP_BASE_URL" "http://localhost:3000")
   :cdn-base-url    (env "CDN_BASE_URL" "https://cdn.houseofesther.co.ke")
   :upload-dir      (env "UPLOAD_DIR" "target/uploads")
   ;; A4 object storage — re-encoded admin-upload + bulk-import image bytes go to
   ;; an S3-compatible bucket (Cloudflare R2). No secret has a checked-in default;
   ;; when MEDIA_S3_ENDPOINT is unset the sink falls back to a local-disk write
   ;; (dev / offline / tests) — see house-of-esther.media.
   :media           {:s3-endpoint          (env "MEDIA_S3_ENDPOINT")
                     :s3-bucket            (env "MEDIA_S3_BUCKET")
                     :s3-access-key-id     (env "MEDIA_S3_ACCESS_KEY_ID")
                     :s3-secret-access-key (env "MEDIA_S3_SECRET_ACCESS_KEY")
                     ;; SigV4 signing region. Must be a real AWS region for the
                     ;; aws-api endpoint resolver ("auto" fails); R2 accepts
                     ;; us-east-1. Rarely needs changing.
                     :s3-region            (env "MEDIA_S3_REGION" "us-east-1")
                     :base-url             (env "MEDIA_BASE_URL")}
   ;; no password in the checked-in default — set DATABASE_URL (with credentials)
   ;; via the environment; see src/backend/env.example.txt
   :database-url    (env "DATABASE_URL"
                         "jdbc:postgresql://localhost:5432/house_of_esther?user=house_of_esther")
   :db-pool-size    (env-int "DB_POOL_SIZE" 8)
   :run-migrations? (env-bool "RUN_MIGRATIONS_ON_START" true)
   :cookie-secure?  (env-bool "SESSION_COOKIE_SECURE" true)
   :trust-proxy?    (env-bool "TRUST_PROXY_HEADERS" false)
   :session-ttl-days (env-int "SESSION_TTL_DAYS" 30)
   :mpesa           {:mode           (env "MPESA_ENV" "stub") ; stub | sandbox | production
                     :base-url       (env "MPESA_BASE_URL" "https://sandbox.safaricom.co.ke")
                     :consumer-key   (env "MPESA_CONSUMER_KEY")
                     :consumer-secret (env "MPESA_CONSUMER_SECRET")
                     :shortcode      (env "MPESA_SHORTCODE")
                     :passkey        (env "MPESA_PASSKEY")
                     :callback-url   (env "MPESA_CALLBACK_URL"
                                          (str (env "APP_BASE_URL" "http://localhost:3000")
                                               "/api/payments/mpesa/callback"))
                     :callback-secret (env "MPESA_CALLBACK_SECRET")}
   :seed            {:admin-email    (env "SEED_ADMIN_EMAIL" "esther@houseofesther.co.ke")
                     :admin-name     (env "SEED_ADMIN_NAME" "Esther W.")
                     :admin-password (env "SEED_ADMIN_PASSWORD")}})
