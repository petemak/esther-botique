(ns house-of-esther.admin.contacts
  "A15 — contact inbox (admin, read-only + mark-handled). Replies happen by
   email outside the app; there is no reply or notes storage here. Records are
   addressed by `reference` (e.g. MSG-2026-0442)."
  (:require [clojure.string :as str]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.page :as page]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.util :as u]))

(def ^:private topics #{"order_issue" "return" "product_question" "wholesale_press" "other"})

(defn- iso [t] (some-> t .toInstant u/iso))

(defn- excerpt [msg]
  (let [m (or msg "")]
    (if (> (count m) 120)
      (str (str/trimr (subs m 0 120)) "...")
      m)))

(defn- detail [row]
  {:reference (:reference row)
   :name (:name row)
   :email (:email row)
   :phone (:phone row)
   :topic (:topic row)
   :orderNumber (:orderNumber row)
   :message (:message row)
   :handled (boolean (:handled row))
   :handledAt (iso (:handledAt row))
   :handledBy (:handledBy row)
   :createdAt (iso (:createdAt row))})

(def ^:private select-cols
  "reference, name, email, phone, topic, order_number as \"orderNumber\", message,
   handled, handled_at as \"handledAt\", handled_by as \"handledBy\", created_at as \"createdAt\"")

(defn- fetch [conn reference]
  (db/q1 conn [(str "select " select-cols " from contact_messages where reference = ?") reference]))

;; --- handlers -------------------------------------------------

(defn list-contacts [{:keys [query-params]}]
  (db/with-tx [conn]
    (let [pg      (page/params query-params)
          handled (u/parse-bool (get query-params "handled"))
          topic   (not-empty (get query-params "topic"))
          _       (when (and topic (not (topics topic)))
                    (throw (err/validation "Unknown topic filter."
                                           [{:field "topic" :message "not a valid topic"}])))
          conds   (cond-> ["1=1"]
                    (some? handled) (conj "handled = ?")
                    topic           (conj "topic = ?"))
          args    (cond-> []
                    (some? handled) (conj handled)
                    topic           (conj topic))
          where   (str/join " and " conds)
          total   (or (db/one-val conn (into [(str "select count(*) from contact_messages where " where)] args)) 0)
          rows    (db/q conn (into [(str "select " select-cols " from contact_messages where " where
                                        " order by created_at desc limit ? offset ?")]
                                   (concat args [(:page-size pg) (:offset pg)])))]
      (resp/ok (page/wrap
                (mapv (fn [r]
                        {:reference (:reference r)
                         :name (:name r)
                         :email (:email r)
                         :phone (:phone r)
                         :topic (:topic r)
                         :orderNumber (:orderNumber r)
                         :messageExcerpt (excerpt (:message r))
                         :handled (boolean (:handled r))
                         :handledAt (iso (:handledAt r))
                         :createdAt (iso (:createdAt r))})
                      rows)
                pg total)))))

(defn get-contact [{{:keys [reference]} :path-params}]
  (db/with-tx [conn]
    (let [row (fetch conn reference)]
      (when-not row (throw (err/not-found "No message with that reference.")))
      (resp/ok (detail row)))))

(def ^:private HandledReq
  [:map {:closed true} [:handled :boolean]])

(defn patch-contact [{:keys [body-params context] {:keys [reference]} :path-params}]
  (let [{:keys [handled]} (v/validate! HandledReq body-params)]
    (db/with-tx [conn]
      (when-not (fetch conn reference)
        (throw (err/not-found "No message with that reference.")))
      (if handled
        (db/exec! conn ["update contact_messages set handled = true, handled_at = now(), handled_by = ? where reference = ?"
                        (get-in context [:admin :id]) reference])
        (db/exec! conn ["update contact_messages set handled = false, handled_at = null, handled_by = null where reference = ?"
                        reference]))
      (resp/ok (detail (fetch conn reference))))))

(def routes
  [["/contacts" {:get list-contacts}]
   ["/contacts/:reference" {:get get-contact :patch patch-contact}]])
