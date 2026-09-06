(ns house-of-esther.account
  "D19-D23 — signed-in account area. Every route requires an authenticated
   customer (enforced by middleware) and only ever touches that customer's rows."
  (:require [buddy.hashers :as hashers]
            [clojure.string :as str]
            [house-of-esther.auth :as auth]
            [house-of-esther.cart :as cart]
            [house-of-esther.catalog :as catalog]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.page :as page]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.money :as money]
            [house-of-esther.orders :as orders]
            [house-of-esther.util :as u]))

(defn- uid [req] (get-in req [:context :user :id]))

;; --- D19 orders ------------------------------------------------

(defn list-orders [{:keys [query-params] :as req}]
  (db/with-tx [conn]
    (let [pg (page/params query-params)
          total (or (db/one-val conn ["select count(*) from orders where user_id = ?" (uid req)]) 0)
          rows (db/q conn ["select order_number as \"orderNumber\", placed_at as \"placedAt\", status,
                                   total_amount as \"totalAmount\"
                            from orders where user_id = ? order by placed_at desc limit ? offset ?"
                           (uid req) (:page-size pg) (:offset pg)])
          items (mapv (fn [o]
                        (let [its (db/q conn ["select oi.image, oi.quantity from order_items oi where oi.order_number = ?" (:orderNumber o)])]
                          {:orderNumber (:orderNumber o)
                           :placedAt (some-> (:placedAt o) .toInstant u/iso)
                           :status (:status o)
                           :total (money/kes (:totalAmount o))
                           :itemCount (reduce + 0 (map :quantity its))
                           :thumbnails (vec (keep #(get-in % [:image :thumbUrl]) its))}))
                      rows)]
      (resp/ok (page/wrap items pg total)))))

(defn get-order [{{:keys [orderNumber]} :path-params :as req}]
  (db/with-tx [conn]
    (let [o (db/q1 conn ["select user_id as \"userId\" from orders where order_number = ?" orderNumber])]
      (when-not (and o (= (:userId o) (uid req)))
        (throw (err/not-found "We couldn't find that order.")))
      (let [order (orders/present-order conn orderNumber {:unmasked? true})
            acc (:agreementAcceptance order)]
        (resp/ok (assoc order :agreementDocuments
                        {:termsOfSale {:version (:termsOfSaleVersion acc)
                                       :href (str "/legal/terms-of-sale/versions/" (:termsOfSaleVersion acc))}
                         :returnsPolicy {:version (:returnsPolicyVersion acc)
                                         :href (str "/legal/returns/versions/" (:returnsPolicyVersion acc))}}))))))

(defn reorder [{{:keys [orderNumber]} :path-params :as req}]
  (db/with-tx [conn]
    (let [o (db/q1 conn ["select user_id as \"userId\" from orders where order_number = ?" orderNumber])]
      (when-not (and o (= (:userId o) (uid req)))
        (throw (err/not-found "We couldn't find that order.")))
      (let [{cart-id :id} (cart/resolve-cart! conn {:user {:id (uid req)}})
            lines (db/q conn ["select oi.variant_id as \"variantId\", oi.quantity, oi.name,
                                      v.stock, v.enabled
                               from order_items oi join product_variants v on v.id = oi.variant_id
                               where oi.order_number = ?" orderNumber])
            unavailable (atom [])]
        (doseq [l lines]
          (if (and (:enabled l) (pos? (long (:stock l))))
            (let [want (min (long (:quantity l)) (long (:stock l)))
                  ex (db/q1 conn ["select id, quantity from cart_items where cart_id = ? and variant_id = ?" cart-id (:variantId l)])]
              (if ex
                (db/exec! conn ["update cart_items set quantity = ? where id = ?"
                                (min (long (:stock l)) (+ (long (:quantity ex)) want)) (:id ex)])
                (db/exec! conn ["insert into cart_items (id, cart_id, variant_id, quantity) values (?,?,?,?)"
                                (u/prefixed-id "ci") cart-id (:variantId l) want])))
            (swap! unavailable conj {:name (:name l) :reason "out_of_stock"})))
        (db/exec! conn ["update carts set updated_at = now() where id = ?" cart-id])
        (resp/ok (assoc (cart/present-cart* conn cart-id) :unavailable @unavailable))))))

;; --- D20 addresses -------------------------------------------

(defn- address-out [a]
  {:id (:id a) :recipientName (:recipientName a) :phone (:phone a)
   :county (:county a) :town (:town a) :instructions (:instructions a)
   :isDefault (boolean (:isDefault a))})

(defn list-addresses [req]
  (db/with-tx [conn]
    (resp/ok {:items (mapv address-out
                           (db/q conn ["select id, recipient_name as \"recipientName\", phone, county, town,
                                               instructions, is_default as \"isDefault\"
                                        from addresses where user_id = ? order by is_default desc, created_at" (uid req)]))})))

(def ^:private AddressReq
  [:map
   [:recipientName v/NonBlank] [:phone v/Phone]
   [:county v/NonBlank] [:town v/NonBlank]
   [:instructions {:optional true} [:maybe :string]]
   [:isDefault {:optional true} :boolean]])

(defn create-address [{:keys [body-params] :as req}]
  (let [a (v/validate! AddressReq body-params)
        id (u/prefixed-id "adr")]
    (db/with-tx [conn]
      (when (:isDefault a)
        (db/exec! conn ["update addresses set is_default = false where user_id = ?" (uid req)]))
      (db/exec! conn ["insert into addresses (id, user_id, recipient_name, phone, county, town, instructions, is_default)
                       values (?,?,?,?,?,?,?,?)"
                      id (uid req) (:recipientName a) (:phone a) (:county a) (:town a)
                      (:instructions a) (boolean (:isDefault a))])
      (resp/created (address-out (db/q1 conn ["select id, recipient_name as \"recipientName\", phone, county, town, instructions, is_default as \"isDefault\" from addresses where id = ?" id]))))))

(def ^:private AddressPatch
  [:map
   [:recipientName {:optional true} v/NonBlank] [:phone {:optional true} v/Phone]
   [:county {:optional true} v/NonBlank] [:town {:optional true} v/NonBlank]
   [:instructions {:optional true} [:maybe :string]]
   [:isDefault {:optional true} :boolean]])

(defn update-address [{:keys [body-params] {:keys [id]} :path-params :as req}]
  (let [a (v/validate! AddressPatch body-params)]
    (db/with-tx [conn]
      (let [own (db/q1 conn ["select id from addresses where id = ? and user_id = ?" id (uid req)])]
        (when-not own (throw (err/not-found "Address not found.")))
        (when (:isDefault a)
          (db/exec! conn ["update addresses set is_default = false where user_id = ?" (uid req)]))
        (doseq [[k col] {:recipientName "recipient_name" :phone "phone" :county "county"
                         :town "town" :instructions "instructions" :isDefault "is_default"}]
          (when (contains? a k)
            (db/exec! conn [(str "update addresses set " col " = ? where id = ?") (get a k) id])))
        (resp/ok (address-out (db/q1 conn ["select id, recipient_name as \"recipientName\", phone, county, town, instructions, is_default as \"isDefault\" from addresses where id = ?" id])))))))

(defn delete-address [{{:keys [id]} :path-params :as req}]
  (db/with-tx [conn]
    (db/exec! conn ["delete from addresses where id = ? and user_id = ?" id (uid req)])
    resp/no-content))

;; --- D21 profile -------------------------------------------

(defn get-profile [req]
  (db/with-tx [conn]
    (let [u (db/q1 conn ["select first_name as \"firstName\", last_name as \"lastName\", email, phone from users where id = ?" (uid req)])]
      (resp/ok u))))

(def ^:private ProfilePatch
  [:map
   [:firstName {:optional true} v/NonBlank]
   [:lastName {:optional true} [:maybe :string]]
   [:phone {:optional true} v/Phone]
   [:email {:optional true} v/Email]
   [:currentPassword {:optional true} :string]
   [:newPassword {:optional true} :string]])

(defn update-profile [{:keys [body-params] :as req}]
  (let [p (v/validate! ProfilePatch body-params)]
    (db/with-tx [conn]
      (let [u (db/q1 conn ["select id, email, password_hash as \"passwordHash\" from users where id = ?" (uid req)])
            sensitive? (or (contains? p :email) (contains? p :newPassword))]
        (when sensitive?
          (when-not (and (:currentPassword p)
                         (:valid (hashers/verify (:currentPassword p) (:passwordHash u))))
            (throw (err/validation "Enter your current password to change your email or password."
                                   [{:field "currentPassword" :message "incorrect"}]))))
        (when (contains? p :newPassword)
          (auth/check-password-strength! (:newPassword p))
          (db/exec! conn ["update users set password_hash = ? where id = ?" (hashers/derive (:newPassword p)) (:id u)]))
        (when-let [email (:email p)]
          (let [email (str/lower-case (str/trim email))]
            (when (db/q1 conn ["select 1 from users where email = ? and id <> ?" email (:id u)])
              (throw (err/conflict "conflict" "That email is already in use." nil)))
            (db/exec! conn ["update users set email = ? where id = ?" email (:id u)])))
        (doseq [[k col] {:firstName "first_name" :lastName "last_name" :phone "phone"}]
          (when (contains? p k)
            (db/exec! conn [(str "update users set " col " = ? where id = ?") (get p k) (:id u)])))
        (db/exec! conn ["update users set updated_at = now() where id = ?" (:id u)])
        (resp/ok (db/q1 conn ["select first_name as \"firstName\", last_name as \"lastName\", email, phone from users where id = ?" (:id u)]))))))

;; --- D22 notification preferences -------------------------

(defn get-prefs [req]
  (db/with-tx [conn]
    (let [u (db/q1 conn ["select new_arrivals as \"newArrivals\", back_in_stock as \"backInStock\", journal from users where id = ?" (uid req)])]
      (resp/ok {:orderUpdates true
                :newArrivals (boolean (:newArrivals u))
                :backInStock (boolean (:backInStock u))
                :journal (boolean (:journal u))}))))

(def ^:private PrefsReq
  [:map
   [:newArrivals {:optional true} :boolean]
   [:backInStock {:optional true} :boolean]
   [:journal {:optional true} :boolean]])

(defn put-prefs [{:keys [body-params] :as req}]
  (let [p (v/validate! PrefsReq body-params)]
    (db/with-tx [conn]
      (db/exec! conn ["update users set new_arrivals = ?, back_in_stock = ?, journal = ? where id = ?"
                      (boolean (:newArrivals p)) (boolean (:backInStock p)) (boolean (:journal p)) (uid req)])
      (resp/ok {:orderUpdates true
                :newArrivals (boolean (:newArrivals p))
                :backInStock (boolean (:backInStock p))
                :journal (boolean (:journal p))}))))

;; --- D23 wishlist ----------------------------------------

(defn- wishlist-items [conn user-id]
  (let [rows (db/q conn [(str "select " catalog/product-cols
                              " from products p join wishlist_items w on w.product_id = p.id
                                where w.user_id = ? and p.status = 'published' order by w.created_at desc") user-id])]
    (catalog/hydrate-cards conn rows)))

(defn get-wishlist [req]
  (db/with-tx [conn]
    (resp/ok {:items (wishlist-items conn (uid req))})))

(def ^:private WishReq [:map [:productId v/NonBlank]])

(defn add-wishlist [{:keys [body-params] :as req}]
  (let [{:keys [productId]} (v/validate! WishReq body-params)]
    (db/with-tx [conn]
      (when-not (db/q1 conn ["select 1 from products where id = ?" productId])
        (throw (err/not-found "Product not found.")))
      (db/exec! conn ["insert into wishlist_items (user_id, product_id) values (?,?) on conflict do nothing"
                      (uid req) productId])
      (resp/ok {:items (wishlist-items conn (uid req))}))))

(defn remove-wishlist [{{:keys [productId]} :path-params :as req}]
  (db/with-tx [conn]
    (db/exec! conn ["delete from wishlist_items where user_id = ? and product_id = ?" (uid req) productId])
    (resp/ok {:items (wishlist-items conn (uid req))})))

(def routes
  [["/account/orders" {:get list-orders}]
   ["/account/orders/:orderNumber" {:get get-order}]
   ["/account/orders/:orderNumber/reorder" {:post reorder}]
   ["/account/addresses" {:get list-addresses :post create-address}]
   ["/account/addresses/:id" {:patch update-address :delete delete-address}]
   ["/account/profile" {:get get-profile :patch update-profile}]
   ["/account/notification-preferences" {:get get-prefs :put put-prefs}]
   ["/account/wishlist" {:get get-wishlist :post add-wishlist}]
   ["/account/wishlist/:productId" {:delete remove-wishlist}]])
