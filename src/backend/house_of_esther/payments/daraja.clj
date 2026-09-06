(ns house-of-esther.payments.daraja
  "Server-side Safaricom Daraja (M-Pesa) client. The frontend never touches
   Safaricom and holds no keys (engineering-standards, non-negotiable).
   MPESA_ENV=stub short-circuits the network for local/dev/test."
  (:require [clj-http.client :as http]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [house-of-esther.obs :as obs])
  (:import [java.time ZoneId]
           [java.time.format DateTimeFormatter]
           [java.util Base64]))

(defn- b64 [^String s] (.encodeToString (Base64/getEncoder) (.getBytes s "UTF-8")))

(defn- timestamp []
  (.format (DateTimeFormatter/ofPattern "yyyyMMddHHmmss")
           (java.time.LocalDateTime/now (ZoneId/of "Africa/Nairobi"))))

(defn- access-token [{:keys [base-url consumer-key consumer-secret]}]
  (-> (http/get (str base-url "/oauth/v1/generate?grant_type=client_credentials")
                {:basic-auth [consumer-key consumer-secret] :as :json :throw-exceptions true})
      :body :access_token))

(defn- normalize-msisdn [phone]
  (let [d (str/replace (str phone) #"[^0-9]" "")]
    (cond
      (str/starts-with? d "254") d
      (str/starts-with? d "0")   (str "254" (subs d 1))
      (str/starts-with? d "7")   (str "254" d)
      (str/starts-with? d "1")   (str "254" d)
      :else d)))

(defn stk-push
  "Initiate an STK push. Returns
     {:ok true  :checkout-request-id \"ws_CO_...\" :merchant-request-id ...}
   or
     {:ok false :retryable? bool :reason \"...\"}."
  [{:keys [mode base-url shortcode passkey callback-url] :as cfg} {:keys [amount phone account-ref description]}]
  (if (= mode "stub")
    (do (obs/infow "mpesa.stk.stub" :amount amount :phone (normalize-msisdn phone))
        {:ok true
         :checkout-request-id (str "ws_CO_stub_" (System/currentTimeMillis))
         :merchant-request-id (str "mr_stub_" (System/currentTimeMillis))})
    (try
      (let [ts    (timestamp)
            pwd   (b64 (str shortcode passkey ts))
            token (access-token cfg)
            resp  (http/post (str base-url "/mpesa/stkpush/v1/processrequest")
                             {:oauth-token token
                              :content-type :json
                              :as :json
                              :throw-exceptions false
                              :form-params {:BusinessShortCode shortcode
                                            :Password pwd
                                            :Timestamp ts
                                            :TransactionType "CustomerPayBillOnline"
                                            :Amount (long amount)
                                            :PartyA (normalize-msisdn phone)
                                            :PartyB shortcode
                                            :PhoneNumber (normalize-msisdn phone)
                                            :CallBackURL callback-url
                                            :AccountReference (or account-ref "HouseOfEsther")
                                            :TransactionDesc (or description "House of Esther order")}})
            body  (:body resp)]
        (cond
          (and (= 200 (:status resp)) (= "0" (str (:ResponseCode body))))
          {:ok true
           :checkout-request-id (:CheckoutRequestID body)
           :merchant-request-id (:MerchantRequestID body)}

          (#{500 502 503 504} (:status resp))
          {:ok false :retryable? true :reason "Safaricom is unreachable right now."}

          :else
          {:ok false :retryable? false
           :reason (or (:errorMessage body) (:ResponseDescription body) "Daraja rejected the request.")}))
      (catch java.net.ConnectException _
        {:ok false :retryable? true :reason "Safaricom is unreachable right now."})
      (catch Exception e
        (log/error e "mpesa.stk.error")
        {:ok false :retryable? true :reason "Safaricom is unreachable right now."}))))

(defn parse-callback
  "Extract the useful bits from a Daraja STK callback body."
  [body]
  (let [cb    (get-in body [:Body :stkCallback])
        items (->> (get-in cb [:CallbackMetadata :Item]) (map (juxt :Name :Value)) (into {}))]
    {:checkout-request-id (:CheckoutRequestID cb)
     :result-code (:ResultCode cb)
     :result-desc (:ResultDesc cb)
     :mpesa-receipt (get items "MpesaReceiptNumber")
     :amount (get items "Amount")
     :phone (get items "PhoneNumber")}))
