(ns house-of-esther.payments
  "D13 STK push, D14 status poll, D15 Safaricom callback. All Safaricom traffic
   is server-to-server; the frontend only sees our own payment resource."
  (:require [house-of-esther.obs :as obs]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.idempotency :as idem]
            [house-of-esther.money :as money]
            [house-of-esther.notify :as notify]
            [house-of-esther.orders :as orders]
            [house-of-esther.payments.daraja :as daraja]
            [house-of-esther.runtime :as runtime]
            [house-of-esther.util :as u]))

(defn- payment-row [conn id]
  (db/q1 conn ["select p.id, p.order_number as \"orderNumber\", p.method, p.state,
                       p.amount_amount as \"amountAmount\", p.mpesa_receipt_number as \"mpesaReceiptNumber\",
                       p.failure_reason as \"failureReason\", p.phone, p.updated_at as \"updatedAt\"
                from payments p where p.id = ?" id]))

(defn present-payment [p]
  {:id (:id p)
   :orderNumber (:orderNumber p)
   :method (:method p)
   :state (:state p)
   :amount (money/kes (:amountAmount p))
   :mpesaReceiptNumber (:mpesaReceiptNumber p)
   :failureReason (:failureReason p)
   :updatedAt (some-> (:updatedAt p) .toInstant u/iso)})

;; --- D13 STK push ------------------------------------------------

(def ^:private StkReq
  [:map [:paymentId v/NonBlank] [:phone {:optional true} [:maybe v/Phone]]])

(defn stk-push [{:keys [body-params headers]}]
  (let [{:keys [paymentId phone]} (v/validate! StkReq body-params)
        key (idem/require-key! headers)
        bh  (idem/hash-body body-params)]
    (db/with-tx [conn]
      (if-let [prior (idem/lookup conn "stk-push" key bh)]
        (assoc (resp/accepted (:body prior)) :status (:status prior))
        (do
          (idem/reserve! conn "stk-push" key bh)
          (let [p (payment-row conn paymentId)]
            (when-not p (throw (err/not-found "We couldn't find that payment.")))
            (when-not (contains? #{"pending" "failed"} (:state p))
              (throw (err/conflict "conflict" "This payment can't be charged right now." nil)))
            (let [order (db/q1 conn ["select order_number as \"orderNumber\", contact from orders where order_number = ?" (:orderNumber p)])
                  msisdn (or phone (:phone p) (get-in order [:contact :phone]))
                  result (daraja/stk-push (runtime/config :mpesa)
                                          {:amount (:amountAmount p)
                                           :phone msisdn
                                           :account-ref (:orderNumber p)
                                           :description (str "House of Esther " (:orderNumber p))})]
              (cond
                (:ok result)
                (do
                  (db/exec! conn ["update payments set state = 'processing', checkout_request_id = ?, phone = ?, failure_reason = null, updated_at = now() where id = ?"
                                  (:checkout-request-id result) msisdn paymentId])
                  (let [body {:paymentId paymentId :state "processing"
                              :message "Check your phone and enter your M-Pesa PIN."
                              :checkoutRequestId (:checkout-request-id result)}]
                    (idem/save-result! conn "stk-push" key 202 body)
                    (resp/accepted body)))

                (:retryable? result)
                (throw (err/service-unavailable (:reason result)))

                :else
                (throw (err/payment-failed (:reason result)))))))))))

;; --- D14 status poll -------------------------------------------

(defn get-payment [{{:keys [paymentId]} :path-params}]
  (db/with-tx [conn]
    (let [p (payment-row conn paymentId)]
      (when-not p (throw (err/not-found "We couldn't find that payment.")))
      (resp/ok (present-payment p)))))

;; --- D15 Safaricom callback (inbound webhook) -----------------

(defn- callback-authorized? [req]
  (let [secret (runtime/config :mpesa :callback-secret)]
    (or (nil? secret)
        (= secret (get-in req [:query-params "secret"]))
        (= secret (get-in req [:headers "x-callback-secret"])))))

(def ^:private failure-copy
  {1032 "You cancelled the prompt."
   1037 "The request timed out."
   1    "Insufficient funds."
   2001 "Wrong M-Pesa PIN."})

(defn mpesa-callback [{:keys [body-params] :as req}]
  (when-not (callback-authorized? req)
    (throw (err/forbidden "Rejected.")))
  (db/with-tx [conn]
    (let [{:keys [checkout-request-id result-code result-desc mpesa-receipt]} (daraja/parse-callback body-params)
          p (when checkout-request-id
              (db/q1 conn ["select id, order_number as \"orderNumber\", state from payments where checkout_request_id = ?" checkout-request-id]))]
      (cond
        (nil? p)
        (obs/warnw "mpesa.callback.unknown" :checkoutRequestId checkout-request-id)

        (contains? #{"paid" "failed" "refunded"} (:state p))
        (obs/infow "mpesa.callback.duplicate" :paymentId (:id p)) ; idempotent on checkoutRequestId

        (zero? (long result-code))
        (do
          (db/exec! conn ["update payments set state = 'paid', mpesa_receipt_number = ?, failure_reason = null, updated_at = now() where id = ?"
                          mpesa-receipt (:id p)])
          (db/exec! conn ["update orders set status = 'confirmed', status_timeline = ?, updated_at = now() where order_number = ? and status = 'placed'"
                          (orders/advance-timeline
                           (:statusTimeline (db/q1 conn ["select status_timeline as \"statusTimeline\" from orders where order_number = ?" (:orderNumber p)]))
                           "confirmed" (u/iso))
                          (:orderNumber p)])
          (db/exec! conn ["insert into order_activity_log (order_number, actor, event, from_status, to_status) values (?,?,?,?,?)"
                          (:orderNumber p) "mpesa" "payment_confirmed" "placed" "confirmed"])
          (notify/enqueue! conn :payment-receipt {:orderNumber (:orderNumber p) :mpesaReceiptNumber mpesa-receipt}))

        :else
        (db/exec! conn ["update payments set state = 'failed', failure_reason = ?, updated_at = now() where id = ?"
                        (get failure-copy (long result-code) (or result-desc "The payment didn't go through.")) (:id p)]))
      (resp/ok {:resultCode 0}))))

(def routes
  [["/payments/mpesa/stk-push" {:post stk-push}]
   ["/payments/mpesa/callback" {:post mpesa-callback}]
   ["/payments/:paymentId"     {:get get-payment}]])
