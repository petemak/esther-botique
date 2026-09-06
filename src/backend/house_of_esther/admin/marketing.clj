(ns house-of-esther.admin.marketing
  "A10 subscribers (+ CSV export) and A11 broadcasts."
  (:require [clojure.string :as str]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.page :as page]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.notify :as notify]
            [house-of-esther.util :as u]))

;; --- subscribers ---------------------------------------------

(defn- subscriber-where [query-params]
  (let [status (not-empty (get query-params "status"))
        source (not-empty (get query-params "source"))
        conds  (cond-> ["variant_id is null"]
                 status (conj "status = ?")
                 source (conj "source = ?"))
        args   (cond-> [] status (conj status) source (conj source))]
    [(str/join " and " conds) args]))

(defn list-subscribers [{:keys [query-params]}]
  (db/with-tx [conn]
    (let [pg (page/params query-params)
          [where args] (subscriber-where query-params)
          total (or (db/one-val conn (into [(str "select count(*) from subscribers where " where)] args)) 0)
          rows (db/q conn (into [(str "select id, email, status, source, new_arrivals as \"newArrivals\",
                                              back_in_stock as \"backInStock\", created_at as \"createdAt\", confirmed_at as \"confirmedAt\"
                                       from subscribers where " where " order by created_at desc limit ? offset ?")]
                                (concat args [(:page-size pg) (:offset pg)])))]
      (resp/ok (page/wrap
                (mapv #(-> % (update :createdAt (fn [t] (some-> t .toInstant u/iso)))
                           (update :confirmedAt (fn [t] (some-> t .toInstant u/iso))))
                      rows)
                pg total)))))

(defn export-subscribers [{:keys [query-params]}]
  (db/with-tx [conn]
    (let [[where args] (subscriber-where query-params)
          rows (db/q conn (into [(str "select email, status, source, new_arrivals as \"newArrivals\",
                                              back_in_stock as \"backInStock\", created_at as \"createdAt\", confirmed_at as \"confirmedAt\"
                                       from subscribers where " where " order by created_at desc")] args))
          csv  (->> (cons "email,status,source,newArrivals,backInStock,createdAt,confirmedAt"
                          (map (fn [r]
                                 (str/join "," [(:email r) (:status r) (:source r) (:newArrivals r) (:backInStock r)
                                                (some-> (:createdAt r) .toInstant u/iso)
                                                (some-> (:confirmedAt r) .toInstant u/iso)]))
                               rows))
                    (str/join "\n"))]
      {:status 200
       :headers {"Content-Type" "text/csv"
                 "Content-Disposition" "attachment; filename=\"subscribers.csv\""
                 "Cache-Control" "no-store"}
       :body csv})))

;; --- broadcasts --------------------------------------------

(def ^:private BroadcastReq
  [:map
   [:subject v/NonBlank]
   [:introHtml {:optional true} [:maybe :string]]
   [:productIds {:optional true} [:vector :string]]
   [:collectionSlug {:optional true} [:maybe :string]]
   [:audience {:optional true} [:enum "new_arrivals_optin"]]])

(defn create-broadcast [{:keys [body-params]}]
  (let [in (v/validate! BroadcastReq body-params)]
    (db/with-tx [conn]
      (let [recipients (or (db/one-val conn ["select count(*) from subscribers where status = 'confirmed' and new_arrivals = true and variant_id is null"]) 0)
            id (u/prefixed-id "bcast")]
        (db/exec! conn ["insert into broadcasts (id, subject, intro_html, product_ids, collection_slug, audience, status, recipient_count)
                         values (?,?,?,?,?,?, 'queued', ?)"
                        id (:subject in) (:introHtml in) (vec (or (:productIds in) []))
                        (:collectionSlug in) (or (:audience in) "new_arrivals_optin") recipients])
        (notify/enqueue! conn :broadcast {:broadcastId id})
        (resp/created {:id id :status "queued" :recipientCount recipients :createdAt (u/iso)})))))

(defn list-broadcasts [_]
  (db/with-tx [conn]
    (resp/ok {:items (mapv #(update % :createdAt (fn [t] (some-> t .toInstant u/iso)))
                           (db/q conn ["select id, subject, status, recipient_count as \"recipientCount\",
                                               sent_count as \"sentCount\", open_count as \"openCount\", created_at as \"createdAt\"
                                        from broadcasts order by created_at desc"]))})))

(defn test-broadcast [{:keys [body-params] {:keys [id]} :path-params}]
  (let [{:keys [email]} (v/validate! [:map [:email v/Email]] body-params)]
    (db/with-tx [conn]
      (when-not (db/q1 conn ["select 1 from broadcasts where id = ?" id])
        (throw (err/not-found "Broadcast not found.")))
      (notify/enqueue! conn :broadcast-test {:broadcastId id :email email})
      (resp/accepted {:status "queued"}))))

(def routes
  [["/subscribers" {:get list-subscribers}]
   ["/subscribers/export" {:get export-subscribers}]
   ["/broadcasts" {:get list-broadcasts :post create-broadcast}]
   ["/broadcasts/:id/test" {:post test-broadcast}]])
