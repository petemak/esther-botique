(ns house-of-esther.admin.moderation
  "A2 dashboard + A9 review moderation."
  (:require [clojure.string :as str]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.page :as page]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.money :as money]
            [house-of-esther.util :as u]))

(defn dashboard [_]
  (db/with-tx [conn]
    (let [n #(or (db/one-val conn %) 0)]
      (resp/ok
       {:orders {:newToday (n ["select count(*) from orders where placed_at::date = now()::date"])
                 :awaitingDispatch (n ["select count(*) from orders where status in ('confirmed','packed')"])
                 :payOnDeliveryUnpaid (n ["select count(*) from payments where method = 'pay_on_delivery' and state = 'awaiting_delivery'"])}
        :attention {:lowStockVariants (n ["select count(*) from product_variants where enabled and stock > 0 and stock <= low_stock_threshold"])
                    :outOfStockPublished (n ["select count(distinct p.id) from products p join product_variants v on v.product_id = p.id
                                              where p.status = 'published'
                                              group by p.id having coalesce(sum(v.stock),0) = 0"])
                    :reviewsPending (n ["select count(*) from reviews where status = 'pending'"])
                    :contactUnhandled (n ["select count(*) from contact_messages where handled = false"])}
        :revenueToday (money/kes (n ["select coalesce(sum(o.total_amount),0) from orders o join payments p on p.order_number = o.order_number
                                      where p.state = 'paid' and o.placed_at::date = now()::date"]))}))))

;; --- A9 reviews -----------------------------------------------

(defn list-reviews [{:keys [query-params]}]
  (db/with-tx [conn]
    (let [pg (page/params query-params)
          status (not-empty (get query-params "status"))
          pid (not-empty (get query-params "productId"))
          conds (cond-> ["1=1"] status (conj "r.status = ?") pid (conj "r.product_id = ?"))
          args (cond-> [] status (conj status) pid (conj pid))
          where (str/join " and " conds)
          total (or (db/one-val conn (into [(str "select count(*) from reviews r where " where)] args)) 0)
          rows (db/q conn (into [(str "select r.id, r.product_id as \"productId\", p.name as \"productName\",
                                              r.author_first_name as \"authorFirstName\", r.author_email as \"authorEmail\",
                                              r.rating, r.title, r.body, r.verified_purchase as \"verifiedPurchase\",
                                              r.status, r.reject_reason as \"rejectReason\", r.created_at as \"createdAt\"
                                       from reviews r join products p on p.id = r.product_id
                                       where " where " order by r.created_at desc limit ? offset ?")]
                                (concat args [(:page-size pg) (:offset pg)])))]
      (resp/ok (page/wrap (mapv #(update % :createdAt (fn [t] (some-> t .toInstant u/iso))) rows) pg total)))))

(def ^:private ReviewPatch
  [:map [:status [:enum "approved" "rejected"]] [:reason {:optional true} [:maybe :string]]])

(defn patch-review [{:keys [body-params] {:keys [id]} :path-params}]
  (let [in (v/validate! ReviewPatch body-params)]
    (db/with-tx [conn]
      (when-not (db/q1 conn ["select 1 from reviews where id = ?" id])
        (throw (err/not-found "Review not found.")))
      (db/exec! conn ["update reviews set status = ?, reject_reason = ? where id = ?"
                      (:status in) (when (= "rejected" (:status in)) (:reason in)) id])
      (resp/ok (-> (db/q1 conn ["select id, product_id as \"productId\", rating, title, body, status,
                                        reject_reason as \"rejectReason\", verified_purchase as \"verifiedPurchase\",
                                        created_at as \"createdAt\"
                                 from reviews where id = ?" id])
                   (update :createdAt (fn [t] (some-> t .toInstant u/iso))))))))

(def routes
  [["/dashboard" {:get dashboard}]
   ["/reviews" {:get list-reviews}]
   ["/reviews/:id" {:patch patch-review}]])
