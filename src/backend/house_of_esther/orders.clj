(ns house-of-esther.orders
  "D12 order creation (with the immutable agreementAcceptance side effect) and
   D16 order reads. Everything is priced and validated server-side."
  (:require [clojure.string :as str]
            [house-of-esther.cart :as cart]
            [house-of-esther.checkout :as checkout]
            [house-of-esther.db :as db]
            [house-of-esther.delivery :as delivery]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.idempotency :as idem]
            [house-of-esther.legal :as legal]
            [house-of-esther.money :as money]
            [house-of-esther.notify :as notify]
            [house-of-esther.runtime :as runtime]
            [house-of-esther.util :as u]))

;; --- pure helpers ---------------------------------------------------

(def chain ["placed" "confirmed" "packed" "dispatched" "out_for_delivery" "delivered"])

(defn valid-transition? [from to]
  (cond
    (= from to) false
    (= to "cancelled") (not (#{"delivered" "cancelled" "refunded"} from))
    (= to "refunded") (#{"delivered" "confirmed" "packed" "dispatched" "out_for_delivery"} from)
    :else (let [fi (.indexOf chain from) ti (.indexOf chain to)]
            (and (>= fi 0) (> ti fi)))))

(defn default-timeline [placed-iso]
  (into [{:status "placed" :at placed-iso}]
        (map #(hash-map :status % :at nil) (rest chain))))

(defn advance-timeline [timeline status at-iso]
  (mapv (fn [entry]
          (if (= (:status entry) status) (assoc entry :at at-iso) entry))
        (if (some #(= (:status %) status) timeline)
          timeline
          (conj (vec timeline) {:status status :at nil}))))

(defn mask-email [e]
  (if (and e (str/includes? e "@"))
    (let [[u d] (str/split e #"@" 2)]
      (str (subs u 0 1) "***@" d))
    e))

(defn mask-phone [p]
  (if (and p (>= (count p) 8))
    (str (subs p 0 5) (apply str (repeat (- (count p) 8) "*")) (subs p (- (count p) 3)))
    p))

(defn cancellable? [status] (contains? #{"placed" "confirmed"} status))

;; --- presenter ----------------------------------------------------

(defn- ts->iso [t] (some-> t .toInstant u/iso))

(defn present-order
  "Build the Order shape. `unmasked?` true for the authenticated owner / admin."
  [conn order-number {:keys [unmasked?]}]
  (let [o (db/q1 conn ["select order_number as \"orderNumber\", user_id as \"userId\", status, contact, delivery_address as \"deliveryAddress\",
                               delivery_method_code as \"deliveryMethodCode\", zone_code as \"zoneCode\",
                               subtotal_amount as \"subtotalAmount\", discount_total_amount as \"discountTotalAmount\",
                               delivery_fee_amount as \"deliveryFeeAmount\", total_amount as \"totalAmount\",
                               discount_code as \"discountCode\", status_timeline as \"statusTimeline\",
                               tracking_reference as \"trackingReference\", courier, placed_at as \"placedAt\"
                        from orders where order_number = ?" order-number])]
    (when-not o (throw (err/not-found "We couldn't find that order.")))
    (let [items   (db/q conn ["select product_id as \"productId\", variant_id as \"variantId\", name, options, image,
                                      unit_price_amount as \"unitPriceAmount\", quantity, line_total_amount as \"lineTotalAmount\"
                               from order_items where order_number = ?" order-number])
          pay     (db/q1 conn ["select id, method, state, mpesa_receipt_number as \"mpesaReceiptNumber\",
                                       amount_amount as \"amountAmount\", updated_at as \"updatedAt\"
                               from payments where order_number = ? order by created_at desc limit 1" order-number])
          acc     (db/q1 conn ["select id, accepted_at as \"acceptedAt\", terms_of_sale_version as \"termsOfSaleVersion\",
                                       returns_policy_version as \"returnsPolicyVersion\"
                               from agreement_acceptances where order_number = ?" order-number])
          method  (db/q1 conn ["select code, label, eta from delivery_methods where code = ?" (:deliveryMethodCode o)])
          contact (:contact o)
          addr    (:deliveryAddress o)]
      {:orderNumber (:orderNumber o)
       :status (:status o)
       :statusTimeline (:statusTimeline o)
       :placedAt (ts->iso (:placedAt o))
       :customer {:firstName (:firstName contact)
                  :email ((if unmasked? identity mask-email) (:email contact))
                  :phone ((if unmasked? identity mask-phone) (:phone contact))}
       :deliveryAddress (cond-> addr
                          (not unmasked?) (assoc :phone (mask-phone (:phone addr))))
       :deliveryMethod {:code (:code method) :label (:label method) :eta (:eta method)}
       :items (mapv (fn [i]
                      {:productId (:productId i) :variantId (:variantId i)
                       :name (:name i) :options (:options i) :image (:image i)
                       :unitPrice (money/kes (:unitPriceAmount i))
                       :quantity (:quantity i)
                       :lineTotal (money/kes (:lineTotalAmount i))})
                    items)
       :subtotal (money/kes (:subtotalAmount o))
       :discountTotal (money/kes (:discountTotalAmount o))
       :deliveryFee (money/kes (:deliveryFeeAmount o))
       :total (money/kes (:totalAmount o))
       :payment (when pay
                  {:method (:method pay)
                   :state (:state pay)
                   :mpesaReceiptNumber (:mpesaReceiptNumber pay)
                   :paidAt (when (= "paid" (:state pay)) (ts->iso (:updatedAt pay)))})
       :trackingReference (:trackingReference o)
       :courier (:courier o)
       :agreementAcceptance (when acc
                              {:id (:id acc)
                               :acceptedAt (ts->iso (:acceptedAt acc))
                               :termsOfSaleVersion (:termsOfSaleVersion acc)
                               :returnsPolicyVersion (:returnsPolicyVersion acc)})
       :cancellable (cancellable? (:status o))})))

;; --- create order ------------------------------------------------

(def ^:private CreateReq
  [:map
   [:contact [:map [:email v/Email] [:phone v/Phone] [:firstName v/NonBlank]]]
   [:deliveryAddress [:map
                      [:recipientName v/NonBlank]
                      [:phone v/Phone]
                      [:county v/NonBlank]
                      [:town v/NonBlank]
                      [:instructions {:optional true} [:maybe :string]]
                      [:saveToAccount {:optional true} :boolean]]]
   [:deliveryMethodCode v/NonBlank]
   [:paymentMethod [:enum "mpesa" "pay_on_delivery"]]
   [:discountCode {:optional true} [:maybe :string]]
   [:marketingOptIn {:optional true} :boolean]
   [:agreementAcceptance [:map
                          [:accepted :boolean]
                          [:termsOfSaleVersion :int]
                          [:returnsPolicyVersion :int]]]
   [:clientTotal v/Money]])

(defn- gen-order-number [conn]
  (let [n (db/one-val conn ["select nextval('order_number_seq')"])]
    (format "HE-%s-%05d" (subs (u/iso-date) 0 4) n)))

(defn- price-preview
  "Corrected order preview attached to a 409 price_changed body."
  [priced]
  {:status "unconfirmed"
   :items (mapv (fn [i] {:productId (:productId i) :variantId (:variantId i)
                         :name (:name i) :options (:options i) :image (:image i)
                         :unitPrice (:unitPrice i) :quantity (:quantity i)
                         :lineTotal (:lineTotal i)})
                (get-in priced [:cart :items]))
   :subtotal (:subtotal priced)
   :discountTotal (:discountTotal priced)
   :deliveryFee (:deliveryFee priced)
   :total (:total priced)})

(defn- reprice
  "Reprice the cart from scratch. Returns a map or throws 409 on stock issues."
  [conn cart-id method-code county]
  (let [c     (cart/present-cart* conn cart-id)
        _     (when (empty? (:items c))
                (throw (err/conflict "conflict" "Your bag is empty." nil)))
        probs (for [i (:items c)
                    :let [avail (db/one-val conn ["select stock from product_variants where id = ? and enabled" (:variantId i)])]
                    :when (or (nil? avail) (< (long avail) (:quantity i)))]
                {:field (:variantId i) :message (str (:name i) " isn't available in that quantity")})
        _     (when (seq probs)
                (throw (err/conflict "out_of_stock" "Some pieces sold out while you were checking out." (vec probs))))
        zone   (delivery/zone-for-county conn county)
        _      (when-not zone
                 (throw (err/validation "We don't deliver to that county yet."
                                        [{:field "county" :message "unknown county"}])))
        method (some #(when (= (:code %) method-code) %) (:methods zone))
        _      (when-not method
                 (throw (err/not-found "That delivery option isn't available for your area.")))
        subtotal (:subtotal c)
        disc     (:discountTotal c)
        free-del (= "free_delivery" (get-in c [:discount :type]))
        fee      (money/kes (if free-del 0 (money/amount (:fee method))))
        total    (money/kes (max 0 (+ (money/amount subtotal) (money/amount disc) (money/amount fee))))]
    {:cart c :zone zone :method method
     :subtotal subtotal :discountTotal disc :deliveryFee fee :total total
     :discountCode (get-in c [:discount :code])}))

(defn- do-create [conn ctx body req]
  (let [{:keys [contact deliveryAddress deliveryMethodCode paymentMethod
                marketingOptIn agreementAcceptance clientTotal]} body
        headers    (:headers req)
        client-ip  (u/client-ip req (:trust-proxy? (runtime/config)))
        user       (:user ctx)
        _          (when (and (:saveToAccount deliveryAddress) (not user))
                     (throw (err/unauthorized "Sign in to save this address to your account.")))
        {:keys [id]} (cart/resolve-cart! conn ctx)
        priced     (reprice conn id deliveryMethodCode (:county deliveryAddress))
        ;; agreement acceptance
        published  (legal/published-versions conn)
        _          (when-not (:accepted agreementAcceptance)
                     (throw (err/ex 422 "agreement_not_accepted"
                                    "Please accept the Terms of Sale and Returns Policy to place your order."
                                    [{:field "agreementAcceptance.accepted" :message "must be true"}])))
        _          (when-not (and (= (:termsOfSaleVersion agreementAcceptance) (:termsOfSale published))
                                  (= (:returnsPolicyVersion agreementAcceptance) (:returns published)))
                     (throw (err/ex 422 "agreement_version_stale"
                                    "Our Terms or Returns Policy were updated. Please review the current version and accept again."
                                    [{:field "termsOfSaleVersion" :message (str "current is " (:termsOfSale published))}
                                     {:field "returnsPolicyVersion" :message (str "current is " (:returns published))}])))
        ;; payment method policy lives on the server (flag + per-method POD rule)
        _          (when-let [msg (checkout/payment-method-problem
                                   paymentMethod (:method priced) (runtime/mpesa-online?))]
                     (throw (err/payment-method-not-allowed msg)))
        placed-iso (u/iso)
        order-no   (gen-order-number conn)
        token      (str "trk_" (u/token))]
    ;; price check — never persist a mismatched order
    (when-not (= (money/amount clientTotal) (money/amount (:total priced)))
      (throw (ex-info "The total changed while you were checking out — please review."
                      {:type :house-of-esther.http.error/api-error
                       :status 409 :code "price_changed"
                       :message "The total changed while you were checking out — please review."
                       :order (price-preview priced)})))
    ;; create order
    (db/exec! conn ["insert into orders (order_number, user_id, status, contact, delivery_address, delivery_method_code,
                                         zone_code, subtotal_amount, discount_total_amount, delivery_fee_amount, total_amount,
                                         discount_code, marketing_opt_in, status_timeline, tracking_token, placed_at)
                     values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?)"
                    order-no (:id user) "placed" contact deliveryAddress deliveryMethodCode
                    (:code (:zone priced)) (money/amount (:subtotal priced)) (money/amount (:discountTotal priced))
                    (money/amount (:deliveryFee priced)) (money/amount (:total priced))
                    (:discountCode priced) (boolean marketingOptIn)
                    (default-timeline placed-iso) token
                    (java.sql.Timestamp/from (java.time.Instant/parse placed-iso))])
    ;; lines + atomic stock decrement
    (doseq [i (get-in priced [:cart :items])]
      (let [updated (db/one-val conn ["update product_variants set stock = stock - ?
                                       where id = ? and stock >= ? returning stock" (:quantity i) (:variantId i) (:quantity i)])]
        (when (nil? updated)
          (throw (err/conflict "out_of_stock" (str (:name i) " sold out.") [{:field (:variantId i) :message "out of stock"}])))
        (db/exec! conn ["insert into order_items (id, order_number, product_id, variant_id, name, options, image,
                                                  unit_price_amount, quantity, line_total_amount)
                         values (?,?,?,?,?,?,?,?,?,?)"
                        (u/prefixed-id "oi") order-no (:productId i) (:variantId i) (:name i)
                        (:options i) (:image i) (money/amount (:unitPrice i)) (:quantity i)
                        (money/amount (:lineTotal i))])))
    ;; immutable acceptance record — same transaction, no order without it
    (let [acc-id (u/prefixed-id "acc")]
      (db/exec! conn ["insert into agreement_acceptances (id, order_number, customer_email, customer_user_id, accepted_at,
                                                          terms_of_sale_version, returns_policy_version, ip_address, user_agent)
                       values (?,?,?,?,?,?,?,?,?)"
                      acc-id order-no (:email contact) (:id user)
                      (java.sql.Timestamp/from (java.time.Instant/parse placed-iso))
                      (:termsOfSaleVersion agreementAcceptance) (:returnsPolicyVersion agreementAcceptance)
                      client-ip (get headers "user-agent")])
      ;; D20 side effect: persist the delivery address to the account when asked
      (when (and (:saveToAccount deliveryAddress) user)
        (when-not (db/q1 conn ["select 1 from addresses where user_id = ? and recipient_name = ? and phone = ? and county = ? and town = ?"
                               (:id user) (:recipientName deliveryAddress) (:phone deliveryAddress)
                               (:county deliveryAddress) (:town deliveryAddress)])
          (db/exec! conn ["insert into addresses (id, user_id, recipient_name, phone, county, town, instructions, is_default)
                           values (?,?,?,?,?,?,?, (select count(*) = 0 from addresses where user_id = ?))"
                          (u/prefixed-id "adr") (:id user) (:recipientName deliveryAddress) (:phone deliveryAddress)
                          (:county deliveryAddress) (:town deliveryAddress) (:instructions deliveryAddress) (:id user)])))
      ;; payment
      (let [pay-id (u/prefixed-id "pay")
            state  (if (= paymentMethod "mpesa") "pending" "awaiting_delivery")]
        (db/exec! conn ["insert into payments (id, order_number, method, state, amount_amount, phone)
                         values (?,?,?,?,?,?)"
                        pay-id order-no paymentMethod state (money/amount (:total priced)) (:phone contact)])
        ;; discount usage
        (when (:discountCode priced)
          (db/exec! conn ["update discounts set times_used = times_used + 1 where code = ?" (:discountCode priced)]))
        ;; clear the cart
        (db/exec! conn ["delete from cart_items where cart_id = ?" id])
        (db/exec! conn ["update carts set discount_code = null where id = ?" id])
        (db/exec! conn ["insert into order_activity_log (order_number, actor, event, to_status) values (?,?,?,?)"
                        order-no "system" "order_placed" "placed"])
        (notify/enqueue! conn :order-confirmation {:orderNumber order-no :email (:email contact)})
        {:status 201
         :body {:order (present-order conn order-no {:unmasked? true})
                :payment {:id pay-id :method paymentMethod :state state
                          :amount (money/kes (money/amount (:total priced)))}
                :trackingToken token
                :agreementAcceptanceId acc-id}}))))

(defn create-order [{:keys [context body-params headers] :as req}]
  (let [body (v/validate! CreateReq body-params)
        key  (idem/require-key! headers)
        bh   (idem/hash-body body-params)]
    (db/with-tx [conn]
      (if-let [prior (idem/lookup conn "orders" key bh)]
        (assoc (resp/created (:body prior)) :status (:status prior))
        (do
          (idem/reserve! conn "orders" key bh)
          (let [{:keys [status body]} (do-create conn context body req)]
            (idem/save-result! conn "orders" key status body)
            (resp/created body)))))))

;; --- reads ------------------------------------------------------

(defn- authorized-read? [o {:keys [context query-params]}]
  (let [token (get query-params "trackingToken")
        email (get query-params "email")]
    (or (get-in context [:admin])
        (and (get-in context [:user :id]) (= (:userId o) (get-in context [:user :id])))
        (and token (= token (:trackingToken o)))
        (and email (= (str/lower-case email)
                      (str/lower-case (or (get-in o [:contact :email]) "")))))))

(defn get-order [{{:keys [orderNumber]} :path-params :as req}]
  (db/with-tx [conn]
    (let [o (db/q1 conn ["select order_number, user_id as \"userId\", tracking_token as \"trackingToken\", contact from orders where order_number = ?" orderNumber])]
      (when-not o (throw (err/not-found "We couldn't find that order.")))
      (when-not (authorized-read? o req)
        (throw (err/not-found "We couldn't find that order.")))
      (let [unmasked? (boolean (or (get-in req [:context :admin])
                                   (and (get-in req [:context :user :id])
                                        (= (:userId o) (get-in req [:context :user :id])))))]
        (resp/ok (present-order conn orderNumber {:unmasked? unmasked?}))))))

(def ^:private LookupReq [:map [:email v/Email]])

(defn lookup-order [{{:keys [orderNumber]} :path-params :keys [body-params]}]
  (let [{:keys [email]} (v/validate! LookupReq body-params)]
    (db/with-tx [conn]
      (let [o (db/q1 conn ["select contact from orders where order_number = ?" orderNumber])]
        (when-not (and o (= (str/lower-case email)
                            (str/lower-case (or (get-in o [:contact :email]) ""))))
          (throw (err/not-found "We couldn't find an order matching those details.")))
        (resp/ok {:order (present-order conn orderNumber {:unmasked? false})})))))

(def ^:private PaymentMethodReq [:map [:paymentMethod [:enum "pay_on_delivery"]]])

(defn change-payment-method [{{:keys [orderNumber]} :path-params :as req}]
  (let [{:keys [paymentMethod]} (v/validate! PaymentMethodReq (:body-params req))]
    (db/with-tx [conn]
      (let [o (db/q1 conn ["select order_number, user_id as \"userId\", status, zone_code as \"zoneCode\", tracking_token as \"trackingToken\", contact from orders where order_number = ?" orderNumber])]
        (when-not o (throw (err/not-found "We couldn't find that order.")))
        (when-not (authorized-read? o req)
          (throw (err/not-found "We couldn't find that order.")))
        (let [pay (db/q1 conn ["select id, state from payments where order_number = ? order by created_at desc limit 1" orderNumber])
              zone-allows (some :payOnDeliveryAllowed
                                (:methods (first (filter #(= (:code %) (:zoneCode o)) (delivery/zones-rows conn)))))]
          (when-not (contains? #{"placed" "confirmed"} (:status o))
            (throw (err/conflict "conflict" "This order is already being prepared." nil)))
          (when (contains? #{"paid" "refunded"} (:state pay))
            (throw (err/conflict "conflict" "This order is already paid." nil)))
          (when-not zone-allows
            (throw (err/conflict "conflict" "Pay on delivery isn't available for this area." nil)))
          (db/exec! conn ["update payments set method = ?, state = 'awaiting_delivery', updated_at = now() where id = ?"
                          paymentMethod (:id pay)])
          (resp/ok (present-order conn orderNumber {:unmasked? (boolean (get-in req [:context :admin]))})))))))

(def routes
  [["/orders" {:post create-order}]
   ["/orders/:orderNumber" {:get get-order}]
   ["/orders/:orderNumber/lookup" {:post lookup-order}]
   ["/orders/:orderNumber/payment-method" {:patch change-payment-method}]])
