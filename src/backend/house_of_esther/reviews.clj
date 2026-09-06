(ns house-of-esther.reviews
  "D6 / D7 — product reviews (public read + authenticated submit)."
  (:require [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.page :as page]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.util :as u]))

(defn summary [conn product-id]
  (let [rows (db/q conn ["select rating, count(*) as c from reviews
                          where product_id = ? and status = 'approved' group by rating" product-id])
        by   (into {} (map (juxt (comp str :rating) :c)) rows)
        cnt  (reduce + 0 (map :c rows))
        avg  (if (pos? cnt)
               (/ (double (reduce + 0 (map #(* (:rating %) (:c %)) rows))) cnt)
               0)]
    {:average (if (pos? cnt) (/ (Math/round (* avg 10.0)) 10.0) 0)
     :count cnt
     :distribution (into {} (for [s ["5" "4" "3" "2" "1"]] [s (long (get by s 0))]))}))

(defn list-reviews [{{:keys [productId]} :path-params :keys [query-params]}]
  (db/with-tx [conn]
    (let [pg   (page/params query-params {:default 10 :max 50})
          sort (case (get query-params "sort")
                 "highest" "rating desc, created_at desc"
                 "lowest"  "rating asc, created_at desc"
                 "created_at desc")
          total (or (db/one-val conn ["select count(*) from reviews where product_id = ? and status = 'approved'" productId]) 0)
          rows (db/q conn [(str "select id, author_first_name as \"authorFirstName\", rating, title, body,
                                        verified_purchase as \"verifiedPurchase\", created_at as \"createdAt\"
                                 from reviews where product_id = ? and status = 'approved' order by " sort " limit ? offset ?")
                           productId (:page-size pg) (:offset pg)])]
      (resp/ok (assoc (page/wrap (mapv #(update % :createdAt (fn [t] (some-> t .toInstant u/iso))) rows) pg total)
                      :summary (summary conn productId))
               resp/cache-catalog))))

(def ^:private ReviewReq
  [:map
   [:rating [:int {:min 1 :max 5}]]
   [:title {:optional true} [:maybe :string]]
   [:body [:string {:min 10 :max 2000}]]
   [:orderNumber {:optional true} [:maybe :string]]])

(defn create-review [{{:keys [productId]} :path-params :keys [body-params context]}]
  (let [user (:user context)
        _    (when-not user (throw (err/unauthorized "Sign in to leave a review.")))
        in   (v/validate! ReviewReq body-params)]
    (db/with-tx [conn]
      (when-not (db/q1 conn ["select 1 from products where id = ?" productId])
        (throw (err/not-found "Product not found.")))
      (when (db/q1 conn ["select 1 from reviews where product_id = ? and user_id = ?" productId (:id user)])
        (throw (err/conflict "conflict" "You've already reviewed this piece." nil)))
      (let [verified (boolean
                      (when (:orderNumber in)
                        (db/q1 conn ["select 1 from orders o join order_items oi on oi.order_number = o.order_number
                                      where o.order_number = ? and o.user_id = ? and o.status = 'delivered' and oi.product_id = ?"
                                     (:orderNumber in) (:id user) productId])))
            id (u/prefixed-id "rev")]
        (db/exec! conn ["insert into reviews (id, product_id, user_id, author_first_name, author_email, rating, title, body, verified_purchase, order_number, status)
                         values (?,?,?,?,?,?,?,?,?,?, 'pending')"
                        id productId (:id user) (:firstName user) (:email user)
                        (:rating in) (:title in) (:body in) verified (:orderNumber in)])
        (resp/created {:id id :status "pending_moderation"
                       :message "Thanks — we read every review before it goes live."})))))

(def routes
  [["/products/:productId/reviews" {:get list-reviews :post create-review}]])
