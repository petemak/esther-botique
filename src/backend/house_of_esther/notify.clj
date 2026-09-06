(ns house-of-esther.notify
  "Notifications are enqueued to an outbox table; a separate worker delivers
   them (email now, SMS when enabled). The API never blocks on delivery."
  (:require [house-of-esther.obs :as obs]
            [house-of-esther.db :as db]))

(defn enqueue!
  ([kind payload] (enqueue! (db/ds) kind payload))
  ([conn kind payload]
   (db/exec! conn ["insert into notification_outbox (kind, payload) values (?, ?)"
                   (name kind) payload])
   (obs/infow "notification.enqueued" :kind (name kind))
   nil))
