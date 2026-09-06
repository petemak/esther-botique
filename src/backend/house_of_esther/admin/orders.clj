(ns house-of-esther.admin.orders
  "A7 order reads + A8 order mutations. Legal status transitions and payment
   state are enforced server-side; the agreementAcceptance block is read-only."
  (:require [clojure.string :as str]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.page :as page]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.idempotency :as idem]
            [house-of-esther.money :as money]
            [house-of-esther.notify :as notify]
            [house-of-esther.orders :as orders]
            [house-of-esther.util :as u]))

;; --- list ------------------------------------------------------

(defn list-orders [{:keys [query-params]}]
  (db/with-tx [conn]
    (let [pg (page/params query-params)
          {:strs [status paymentState paymentMethod zone q dateFrom dateTo]} query-params
          conds (cond-> ["1=1"]
                  status        (conj "o.status = ?")
                  zone          (conj "o.zone_code = ?")
                  dateFrom      (conj "o.placed_at >= ?::timestamptz")
                  dateTo        (conj "o.placed_at <= ?::timestamptz")
                  paymentState  (conj "exists (select 1 from payments p where p.order_number = o.order_number and p.state = ?)")
                  paymentMethod (conj "exists (select 1 from payments p where p.order_number = o.order_number and p.method = ?)")
                  q             (conj "(o.order_number ilike ? or o.contact->>'email' ilike ? or o.contact->>'phone' ilike ?)"))
          args (cond-> []
                 status (conj status) zone (conj zone)
                 dateFrom (conj dateFrom) dateTo (conj dateTo)
                 paymentState (conj paymentState) paymentMethod (conj paymentMethod)
                 q (into [(str "%" q "%") (str "%" q "%") (str "%" q "%")]))
          where (str/join " and " conds)
          total (or (db/one-val conn (into [(str "select count(*) from orders o where " where)] args)) 0)
          rows (db/q conn (into [(str "select o.order_number as \"orderNumber\", o.placed_at as \"placedAt\",
                                              o.delivery_address->>'recipientName' as \"customerName\",
                                              o.delivery_address->>'county' as county,
                                              o.total_amount as \"totalAmount\", o.status,
                                              (select p.method from payments p where p.order_number = o.order_number order by created_at desc limit 1) as \"paymentMethod\",
                                              (select p.state from payments p where p.order_number = o.order_number order by created_at desc limit 1) as \"paymentState\"
                                       from orders o where " where " order by o.placed_at desc limit ? offset ?")]
                                (concat args [(:page-size pg) (:offset pg)])))]
      (resp/ok (page/wrap
                (mapv (fn [r]
                        {:orderNumber (:orderNumber r)
                         :placedAt (some-> (:placedAt r) .toInstant u/iso)
                         :customerName (:customerName r)
                         :county (:county r)
                         :total (money/kes (:totalAmount r))
                         :paymentMethod (:paymentMethod r)
                         :paymentState (:paymentState r)
                         :status (:status r)})
                      rows)
                pg total)))))

;; --- detail --------------------------------------------------

(defn get-order [{{:keys [orderNumber]} :path-params}]
  (db/with-tx [conn]
    (let [base (orders/present-order conn orderNumber {:unmasked? true})
          acc  (db/q1 conn ["select id, accepted_at as \"acceptedAt\", customer_email as \"customerEmail\",
                                    customer_user_id as \"customerUserId\", terms_of_sale_version as \"termsOfSaleVersion\",
                                    returns_policy_version as \"returnsPolicyVersion\", ip_address as \"ipAddress\", user_agent as \"userAgent\"
                             from agreement_acceptances where order_number = ?" orderNumber])
          log  (db/q conn ["select at, actor, event, from_status as \"from\", to_status as \"to\"
                            from order_activity_log where order_number = ? order by at" orderNumber])
          notes (db/q conn ["select id, at, author, body from order_notes where order_number = ? order by at" orderNumber])]
      (resp/ok
       (assoc base
              :agreementAcceptance
              (when acc
                {:id (:id acc)
                 :acceptedAt (some-> (:acceptedAt acc) .toInstant u/iso)
                 :customerEmail (:customerEmail acc)
                 :customerUserId (:customerUserId acc)
                 :termsOfSaleVersion (:termsOfSaleVersion acc)
                 :returnsPolicyVersion (:returnsPolicyVersion acc)
                 :termsOfSaleHref (str "/api/legal/terms-of-sale/versions/" (:termsOfSaleVersion acc))
                 :returnsPolicyHref (str "/api/legal/returns/versions/" (:returnsPolicyVersion acc))
                 :ipAddress (:ipAddress acc)
                 :userAgent (:userAgent acc)})
              :activityLog (mapv #(update % :at (fn [t] (some-> t .toInstant u/iso))) log)
              :internalNotes (mapv #(update % :at (fn [t] (some-> t .toInstant u/iso))) notes))))))

;; --- A8 status ---------------------------------------------

(def ^:private StatusReq
  [:map
   [:status [:enum "placed" "confirmed" "packed" "dispatched" "out_for_delivery" "delivered" "cancelled"]]
   [:courier {:optional true} [:maybe :string]]
   [:trackingReference {:optional true} [:maybe :string]]
   [:notifyCustomer {:optional true} :boolean]])

(defn patch-status [{:keys [body-params headers context] {:keys [orderNumber]} :path-params}]
  (let [in  (v/validate! StatusReq body-params)
        key (idem/require-key! headers)
        bh  (idem/hash-body body-params)]
    (db/with-tx [conn]
      (if-let [prior (idem/lookup conn "admin-order-status" key bh)]
        (assoc (resp/ok (:body prior)) :status (:status prior))
        (do
          (idem/reserve! conn "admin-order-status" key bh)
          (let [o (db/q1 conn ["select status, status_timeline as \"statusTimeline\" from orders where order_number = ?" orderNumber])]
            (when-not o (throw (err/not-found "Order not found.")))
            (when-not (orders/valid-transition? (:status o) (:status in))
              (throw (err/conflict "conflict" (str "Can't move an order from " (:status o) " to " (:status in) ".") nil)))
            (when (and (= "dispatched" (:status in))
                       (or (u/blank? (:courier in)) (u/blank? (:trackingReference in))))
              (throw (err/validation "Courier and tracking reference are required to dispatch."
                                     [{:field "courier" :message "required"}
                                      {:field "trackingReference" :message "required"}])))
            (db/exec! conn ["update orders set status = ?, status_timeline = ?,
                              courier = coalesce(?, courier), tracking_reference = coalesce(?, tracking_reference),
                              updated_at = now() where order_number = ?"
                            (:status in)
                            (orders/advance-timeline (:statusTimeline o) (:status in) (u/iso))
                            (:courier in) (:trackingReference in) orderNumber])
            (db/exec! conn ["insert into order_activity_log (order_number, actor, event, from_status, to_status) values (?,?,?,?,?)"
                            orderNumber (get-in context [:admin :id]) "status_changed" (:status o) (:status in)])
            (when (:notifyCustomer in)
              (notify/enqueue! conn :order-status {:orderNumber orderNumber :status (:status in)}))
            (let [body (orders/present-order conn orderNumber {:unmasked? true})]
              (idem/save-result! conn "admin-order-status" key 200 body)
              (resp/ok body))))))))

;; --- A8 payment -------------------------------------------

(def ^:private PaymentReq
  [:map
   [:state [:enum "pending" "paid" "failed" "refunded" "awaiting_delivery"]]
   [:reference {:optional true} [:maybe :string]]
   [:note {:optional true} [:maybe :string]]])

(defn patch-payment [{:keys [body-params context] {:keys [orderNumber]} :path-params}]
  (let [in (v/validate! PaymentReq body-params)]
    (db/with-tx [conn]
      (let [pay (db/q1 conn ["select id from payments where order_number = ? order by created_at desc limit 1" orderNumber])]
        (when-not pay (throw (err/not-found "Order/payment not found.")))
        (db/exec! conn ["update payments set state = ?, mpesa_receipt_number = coalesce(?, mpesa_receipt_number), updated_at = now() where id = ?"
                        (:state in) (:reference in) (:id pay)])
        (when (= "paid" (:state in))
          (let [o (db/q1 conn ["select status, status_timeline as \"statusTimeline\" from orders where order_number = ?" orderNumber])]
            (when (= "placed" (:status o))
              (db/exec! conn ["update orders set status = 'confirmed', status_timeline = ?, updated_at = now() where order_number = ?"
                              (orders/advance-timeline (:statusTimeline o) "confirmed" (u/iso)) orderNumber]))))
        (db/exec! conn ["insert into order_activity_log (order_number, actor, event) values (?,?,?)"
                        orderNumber (get-in context [:admin :id]) (str "payment_" (:state in))])
        (when (:note in)
          (db/exec! conn ["insert into order_notes (id, order_number, author, body) values (?,?,?,?)"
                          (u/prefixed-id "n") orderNumber (get-in context [:admin :id]) (:note in)]))
        (resp/ok (orders/present-order conn orderNumber {:unmasked? true}))))))

;; --- A8 refund -------------------------------------------

(def ^:private RefundReq
  [:map
   [:amount v/Money]
   [:reason {:optional true} [:maybe :string]]
   [:reference {:optional true} [:maybe :string]]
   [:restock {:optional true} :boolean]])

(defn refund [{:keys [body-params headers context] {:keys [orderNumber]} :path-params}]
  (let [in  (v/validate! RefundReq body-params)
        key (idem/require-key! headers)
        bh  (idem/hash-body body-params)]
    (db/with-tx [conn]
      (if-let [prior (idem/lookup conn "admin-refund" key bh)]
        (assoc (resp/created (:body prior)) :status (:status prior))
        (do
          (idem/reserve! conn "admin-refund" key bh)
          (let [o (db/q1 conn ["select status from orders where order_number = ?" orderNumber])]
            (when-not o (throw (err/not-found "Order not found.")))
            (let [id (u/prefixed-id "ref")
                  admin-id (get-in context [:admin :id])]
              (db/exec! conn ["insert into refunds (id, order_number, amount_amount, reason, reference, restock, created_by)
                               values (?,?,?,?,?,?,?)"
                              id orderNumber (money/amount (:amount in)) (:reason in) (:reference in)
                              (boolean (:restock in)) admin-id])
              (db/exec! conn ["update payments set state = 'refunded', updated_at = now() where order_number = ?" orderNumber])
              (db/exec! conn ["update orders set status = 'refunded', updated_at = now() where order_number = ?" orderNumber])
              (when (:restock in)
                (doseq [li (db/q conn ["select variant_id as \"variantId\", quantity from order_items where order_number = ?" orderNumber])]
                  (db/exec! conn ["update product_variants set stock = stock + ? where id = ?" (:quantity li) (:variantId li)])
                  (db/exec! conn ["insert into inventory_adjustments (id, variant_id, delta, reason, note, resulting_stock, created_by)
                                   values (?,?,?,?,?, (select stock from product_variants where id = ?), ?)"
                                  (u/prefixed-id "adj") (:variantId li) (:quantity li) "return_to_stock"
                                  (str "refund " orderNumber) (:variantId li) admin-id])))
              (db/exec! conn ["insert into order_activity_log (order_number, actor, event, to_status) values (?,?,?,?)"
                              orderNumber admin-id "refunded" "refunded"])
              (let [body {:id id :orderNumber orderNumber :amount (:amount in)
                          :reason (:reason in) :reference (:reference in)
                          :restock (boolean (:restock in)) :createdAt (u/iso) :createdBy admin-id}]
                (idem/save-result! conn "admin-refund" key 201 body)
                (resp/created body)))))))))

;; --- notes + resend ----------------------------------------

(defn add-note [{:keys [body-params context] {:keys [orderNumber]} :path-params}]
  (let [{:keys [body]} (v/validate! [:map [:body v/NonBlank]] body-params)]
    (db/with-tx [conn]
      (when-not (db/q1 conn ["select 1 from orders where order_number = ?" orderNumber])
        (throw (err/not-found "Order not found.")))
      (let [id (u/prefixed-id "n")
            author (get-in context [:admin :id])]
        (db/exec! conn ["insert into order_notes (id, order_number, author, body) values (?,?,?,?)"
                        id orderNumber author body])
        (resp/created {:id id :at (u/iso) :author author :body body})))))

(defn resend-notification [{:keys [body-params] {:keys [orderNumber]} :path-params}]
  (let [{:keys [type]} (v/validate! [:map [:type [:enum "confirmation" "dispatched" "receipt"]]] body-params)]
    (db/with-tx [conn]
      (when-not (db/q1 conn ["select 1 from orders where order_number = ?" orderNumber])
        (throw (err/not-found "Order not found.")))
      (notify/enqueue! conn (keyword (str "resend-" type)) {:orderNumber orderNumber})
      (resp/accepted {:status "queued"}))))

(def routes
  [["/orders" {:get list-orders}]
   ["/orders/:orderNumber" {:get get-order}]
   ["/orders/:orderNumber/status" {:patch patch-status}]
   ["/orders/:orderNumber/payment" {:patch patch-payment}]
   ["/orders/:orderNumber/refund" {:post refund}]
   ["/orders/:orderNumber/notes" {:post add-note}]
   ["/orders/:orderNumber/resend-notification" {:post resend-notification}]])
