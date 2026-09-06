(ns house-of-esther.cart
  "D8 — cart. Guests carry an httpOnly `he_cart` cookie; on login the guest cart
   is merged into the account cart. All pricing is server-side."
  (:require [clojure.set :as set]
            [clojure.string :as str]
            [house-of-esther.catalog :as catalog]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.money :as money]
            [house-of-esther.present :as present]
            [house-of-esther.auth.session :as session]
            [house-of-esther.util :as u]))

;; --- discount pricing (pure) ------------------------------------------

(defn discount-active? [d now-ms]
  (and (:active d)
       (or (nil? (:startsAt d)) (<= (.getTime ^java.sql.Timestamp (:startsAt d)) now-ms))
       (or (nil? (:endsAt d))   (>= (.getTime ^java.sql.Timestamp (:endsAt d)) now-ms))))

(defn compute-discount
  "Pure. Given subtotal (Money), a discount row and the set of line category
   slugs, return {:code :type :value :amount(Money, negative)} or throw a 422
   describing the ineligibility."
  [subtotal discount line-categories]
  (let [now (System/currentTimeMillis)
        sub (money/amount subtotal)]
    (when-not (discount-active? discount now)
      (throw (err/validation "That code isn't active right now.")))
    (when (and (:minSpendAmount discount) (< sub (:minSpendAmount discount)))
      (throw (err/validation (format "Spend at least KES %d to use this code."
                                     (:minSpendAmount discount)))))
    (when (and (:usageLimitTotal discount)
               (>= (:timesUsed discount) (:usageLimitTotal discount)))
      (throw (err/validation "This code has reached its usage limit.")))
    (let [eligible (set (:eligibleCategories discount))]
      (when (and (seq eligible) (empty? (set/intersection eligible (set line-categories))))
        (throw (err/validation "This code doesn't apply to anything in your bag."))))
    (let [amount (case (:type discount)
                   "percent"       (money/amount (money/percent-of subtotal (:value discount)))
                   "fixed"         (min sub (long (:value discount)))
                   "free_delivery" 0
                   0)]
      {:code (:code discount)
       :type (:type discount)
       :value (:value discount)
       :amount (money/kes (- amount))})))

;; --- cart resolution & rows ------------------------------------------

(defn- new-cart! [conn user-id]
  (let [id (u/prefixed-id "cart")]
    (db/exec! conn ["insert into carts (id, user_id) values (?, ?)" id user-id])
    id))

(defn resolve-cart!
  "Return {:id cart-id :fresh? bool}. Uses the account cart when signed in,
   otherwise the `he_cart` cookie, creating a cart when needed."
  [conn {:keys [user cart-id]}]
  (if user
    (let [row (db/q1 conn ["select id from carts where user_id = ?" (:id user)])]
      (if row
        {:id (:id row) :fresh? false}
        {:id (new-cart! conn (:id user)) :fresh? true}))
    (let [row (when cart-id (db/q1 conn ["select id from carts where id = ? and user_id is null" cart-id]))]
      (if row
        {:id (:id row) :fresh? false}
        {:id (new-cart! conn nil) :fresh? true}))))

(defn- line-rows [conn cart-id]
  (db/q conn
        ["select ci.id as \"itemId\", ci.quantity, ci.variant_id as \"variantId\",
                 v.options, v.price_amount as \"priceAmount\", v.stock,
                 v.low_stock_threshold as \"lowStockThreshold\", v.enabled, v.image_id as \"imageId\",
                 p.id as \"productId\", p.slug, p.name, p.category
          from cart_items ci
          join product_variants v on v.id = ci.variant_id
          join products p on p.id = v.product_id
          where ci.cart_id = ?
          order by ci.created_at" cart-id]))

(defn- present-cart [conn cart-id]
  (let [cart  (db/q1 conn ["select id, discount_code as \"discountCode\", updated_at as \"updatedAt\" from carts where id = ?" cart-id])
        lines (line-rows conn cart-id)
        imgs  (catalog/images-by-id conn (map :imageId lines))
        items (mapv (fn [l]
                      (let [line-total (* (long (:priceAmount l)) (long (:quantity l)))
                            state (present/stock-state l)]
                        (cond-> {:id (:itemId l)
                                 :productId (:productId l)
                                 :variantId (:variantId l)
                                 :slug (:slug l)
                                 :name (:name l)
                                 :options (:options l)
                                 :image (present/img-thumb (get imgs (:imageId l)))
                                 :unitPrice (money/kes (:priceAmount l))
                                 :quantity (:quantity l)
                                 :lineTotal (money/kes line-total)
                                 :stockState state}
                          (not= state "in_stock")
                          (assoc :quantityAvailable (max 0 (long (or (:stock l) 0)))))))
                    lines)
        subtotal (money/kes (reduce + 0 (map #(money/amount (:lineTotal %)) items)))
        line-cats (map :category lines)
        discount (when (:discountCode cart)
                   (when-let [d (db/q1 conn ["select code, type, value, min_spend_amount as \"minSpendAmount\",
                                                     usage_limit_total as \"usageLimitTotal\", times_used as \"timesUsed\",
                                                     eligible_categories as \"eligibleCategories\",
                                                     starts_at as \"startsAt\", ends_at as \"endsAt\", active
                                              from discounts where code = ?" (:discountCode cart)])]
                     (try (compute-discount subtotal d line-cats) (catch Exception _ nil))))]
    {:id (:id cart)
     :items items
     :discount discount
     :subtotal subtotal
     :discountTotal (or (:amount discount) (money/kes 0))
     :estimatedDelivery nil
     :estimatedTotal nil
     :currency "KES"
     :updatedAt (u/iso (some-> (:updatedAt cart) .toInstant))}))

(defn- touch! [conn cart-id]
  (db/exec! conn ["update carts set updated_at = now() where id = ?" cart-id]))

(defn- respond [conn cart-id fresh?]
  (cond-> (resp/ok (present-cart conn cart-id))
    fresh? (resp/with-cookie session/cart-cookie cart-id
             {:path "/" :http-only true :same-site :lax :max-age (* 60 60 24 60)})))

;; --- handlers --------------------------------------------------------

(defn get-cart [{:keys [context]}]
  (db/with-tx [conn]
    (let [{:keys [id fresh?]} (resolve-cart! conn context)]
      (respond conn id fresh?))))

(def ^:private AddItem
  [:map [:variantId v/NonBlank] [:quantity {:optional true} [:int {:min 1 :max 99}]]])

(defn add-item [{:keys [context body-params]}]
  (let [{:keys [variantId quantity]} (v/validate! AddItem body-params)
        qty (or quantity 1)]
    (db/with-tx [conn]
      (let [{:keys [id fresh?]} (resolve-cart! conn context)
            variant (db/q1 conn ["select id, stock, enabled from product_variants where id = ?" variantId])]
        (when-not variant (throw (err/not-found "That option is no longer available.")))
        (when (or (not (:enabled variant)) (<= (long (:stock variant)) 0))
          (throw (err/conflict "out_of_stock" "That option just sold out." nil)))
        (let [existing (db/q1 conn ["select id, quantity from cart_items where cart_id = ? and variant_id = ?" id variantId])
              want     (+ (long (or (:quantity existing) 0)) qty)
              clamped  (max 1 (min want (long (:stock variant))))]
          (if existing
            (db/exec! conn ["update cart_items set quantity = ? where id = ?" clamped (:id existing)])
            (db/exec! conn ["insert into cart_items (id, cart_id, variant_id, quantity) values (?, ?, ?, ?)"
                            (u/prefixed-id "ci") id variantId clamped]))
          (touch! conn id)
          (respond conn id fresh?))))))

(def ^:private PatchItem [:map [:quantity [:int {:min 1 :max 99}]]])

(defn patch-item [{:keys [context body-params] {:keys [itemId]} :path-params}]
  (let [{:keys [quantity]} (v/validate! PatchItem body-params)]
    (db/with-tx [conn]
      (let [{:keys [id]} (resolve-cart! conn context)
            row (db/q1 conn ["select ci.id, v.stock from cart_items ci join product_variants v on v.id = ci.variant_id
                              where ci.id = ? and ci.cart_id = ?" itemId id])]
        (when-not row (throw (err/not-found "That item isn't in your bag.")))
        (db/exec! conn ["update cart_items set quantity = ? where id = ?"
                        (max 1 (min quantity (long (:stock row)))) itemId])
        (touch! conn id)
        (resp/ok (present-cart conn id))))))

(defn delete-item [{:keys [context] {:keys [itemId]} :path-params}]
  (db/with-tx [conn]
    (let [{:keys [id]} (resolve-cart! conn context)]
      (db/exec! conn ["delete from cart_items where id = ? and cart_id = ?" itemId id])
      (touch! conn id)
      (resp/ok (present-cart conn id)))))

(def ^:private DiscountReq [:map [:code v/NonBlank]])

(defn apply-discount [{:keys [context body-params]}]
  (let [{:keys [code]} (v/validate! DiscountReq body-params)
        code (str/upper-case (str/trim code))]
    (db/with-tx [conn]
      (let [{:keys [id]} (resolve-cart! conn context)
            d (db/q1 conn ["select code, type, value, min_spend_amount as \"minSpendAmount\",
                                   usage_limit_total as \"usageLimitTotal\", times_used as \"timesUsed\",
                                   eligible_categories as \"eligibleCategories\",
                                   starts_at as \"startsAt\", ends_at as \"endsAt\", active
                            from discounts where upper(code) = ?" code])]
        (when-not d (throw (err/not-found "We don't recognise that code.")))
        (let [cart (present-cart conn id)]
          ;; validates or throws 422 with a reason
          (compute-discount (:subtotal cart) d (map :category (line-rows conn id)))
          (db/exec! conn ["update carts set discount_code = ?, updated_at = now() where id = ?" (:code d) id])
          (resp/ok (present-cart conn id)))))))

(defn remove-discount [{:keys [context]}]
  (db/with-tx [conn]
    (let [{:keys [id]} (resolve-cart! conn context)]
      (db/exec! conn ["update carts set discount_code = null, updated_at = now() where id = ?" id])
      (resp/ok (present-cart conn id)))))

;; --- merge on login -------------------------------------------------

(defn merge-guest-cart!
  "Move guest cart lines into the user's account cart (called on login/register)."
  [conn user-id guest-cart-id]
  (when guest-cart-id
    (when-let [guest (db/q1 conn ["select id from carts where id = ? and user_id is null" guest-cart-id])]
      (let [{:keys [id]} (resolve-cart! conn {:user {:id user-id}})]
        (doseq [gi (db/q conn ["select variant_id as \"variantId\", quantity from cart_items where cart_id = ?" (:id guest)])]
          (let [ex (db/q1 conn ["select id, quantity from cart_items where cart_id = ? and variant_id = ?" id (:variantId gi)])
                stock (or (db/one-val conn ["select stock from product_variants where id = ?" (:variantId gi)]) 0)]
            (if ex
              (db/exec! conn ["update cart_items set quantity = ? where id = ?"
                              (min (long stock) (+ (long (:quantity ex)) (long (:quantity gi)))) (:id ex)])
              (db/exec! conn ["insert into cart_items (id, cart_id, variant_id, quantity) values (?, ?, ?, ?)"
                              (u/prefixed-id "ci") id (:variantId gi) (min (long stock) (long (:quantity gi)))]))))
        (db/exec! conn ["delete from carts where id = ?" (:id guest)])))))

(def present-cart* present-cart)

(def routes
  [["/cart"                 {:get get-cart}]
   ["/cart/items"           {:post add-item}]
   ["/cart/items/:itemId"   {:patch patch-item :delete delete-item}]
   ["/cart/discount"        {:post apply-discount :delete remove-discount}]])
