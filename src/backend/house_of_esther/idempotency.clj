(ns house-of-esther.idempotency
  "Idempotency-Key support for POST /orders and the STK push.
   Same key + same body within the retention window returns the stored result;
   same key + different body -> 409 idempotency_key_reused."
  (:require [jsonista.core :as j]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err])
  (:import [java.security MessageDigest]))

(defn hash-body [body]
  (let [md (MessageDigest/getInstance "SHA-256")
        bs (.digest md (.getBytes (j/write-value-as-string (or body {})) "UTF-8"))]
    (apply str (map #(format "%02x" %) bs))))

(defn require-key! [headers]
  (or (get headers "idempotency-key")
      (throw (err/validation "This request needs an Idempotency-Key header."
                             [{:field "Idempotency-Key" :message "required"}]))))

(defn lookup
  "Return {:status :body} for a completed prior request with the same key+body,
   or throws 409 idempotency_key_reused if the key was used with a different body,
   or nil if this key is new."
  [conn scope idem-key body-hash]
  (when-let [row (db/q1 conn ["select request_hash as \"requestHash\", response_status as \"responseStatus\", response_body as \"responseBody\"
                               from idempotency_keys where scope = ? and idem_key = ?" scope idem-key])]
    (if (= (:requestHash row) body-hash)
      {:status (:responseStatus row) :body (:responseBody row)}
      (throw (err/conflict "idempotency_key_reused"
                           "That request key was already used with different details." nil)))))

(defn reserve!
  "Insert a placeholder row so concurrent replays collide on the unique index."
  [conn scope idem-key body-hash]
  (db/exec! conn ["insert into idempotency_keys (scope, idem_key, request_hash) values (?, ?, ?)
                   on conflict (scope, idem_key) do nothing" scope idem-key body-hash]))

(defn save-result! [conn scope idem-key status body]
  (db/exec! conn ["update idempotency_keys set response_status = ?, response_body = ?
                   where scope = ? and idem_key = ?" status body scope idem-key]))
