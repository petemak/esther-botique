(ns house-of-esther.util
  "Small shared helpers: ids, time, string casing."
  (:require [clojure.string :as str])
  (:import [java.time Instant ZoneOffset]
           [java.time.format DateTimeFormatter]
           [java.util UUID]))

(defn now ^Instant [] (Instant/now))

(defn iso
  "ISO-8601 UTC string, e.g. 2026-09-06T14:30:00Z."
  ([] (iso (now)))
  ([^Instant t]
   (when t
     (.format (.withZone DateTimeFormatter/ISO_INSTANT ZoneOffset/UTC) t))))

(defn iso-date
  "ISO date (yyyy-MM-dd)."
  ([] (iso-date (now)))
  ([^Instant t] (subs (iso t) 0 10)))

(defn uuid [] (str (UUID/randomUUID)))

(defn token
  "URL-safe opaque token."
  [] (-> (str (UUID/randomUUID) (UUID/randomUUID))
         (str/replace "-" "")))

(defn prefixed-id
  "Short prefixed id, e.g. prod_1a2b3c."
  [prefix]
  (str prefix "_" (subs (str/replace (uuid) "-" "") 0 10)))

(defn ->camel
  "snake_case / kebab-case string -> camelCase keyword."
  [s]
  (let [parts (str/split (name s) #"[_-]")]
    (keyword
     (apply str (first parts)
            (map str/capitalize (rest parts))))))

(defn ->snake
  "camelCase keyword/string -> snake_case string."
  [k]
  (-> (name k)
      (str/replace #"([a-z0-9])([A-Z])" "$1_$2")
      (str/lower-case)))

(defn parse-long* [s]
  (try (when s (Long/parseLong (str s))) (catch Exception _ nil)))

(defn parse-bool [s]
  (case (some-> s str str/lower-case)
    ("1" "true" "yes" "on") true
    ("0" "false" "no" "off") false
    nil))

(defn blank? [s] (or (nil? s) (and (string? s) (str/blank? s))))

(defn client-ip
  "Best-effort client IP for audit records. Only trusts X-Forwarded-For /
   X-Real-IP when `trust-proxy?` (deployment sits behind a known proxy);
   otherwise the socket peer address."
  [req trust-proxy?]
  (or (when trust-proxy?
        (or (some-> (get-in req [:headers "x-forwarded-for"])
                    (str/split #",") first str/trim not-empty)
            (not-empty (get-in req [:headers "x-real-ip"]))))
      (:remote-addr req)))
