(ns house-of-esther.checkout
  "D10 — delivery quote. Re-prices the current cart and resolves the delivery
   zone from the county. Cache-Control: private, max-age=30."
  (:require [house-of-esther.cart :as cart]
            [house-of-esther.db :as db]
            [house-of-esther.delivery :as delivery]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.money :as money]
            [house-of-esther.runtime :as runtime]))

(def ^:private QuoteReq
  [:map [:county v/NonBlank] [:town {:optional true} [:maybe :string]]])

(defn stock-problems
  "Return a seq of {:field :message} for cart lines that can't be fulfilled."
  [cart-items]
  (for [i cart-items
        :when (or (= "out_of_stock" (:stockState i))
                  (and (:quantityAvailable i) (> (:quantity i) (:quantityAvailable i))))]
    {:field (:variantId i)
     :message (str (:name i) (if (= "out_of_stock" (:stockState i))
                               " is out of stock"
                               (str " has only " (:quantityAvailable i) " left")))}))

(defn allowed-payment-methods
  "Payment methods a zone accepts. Online M-Pesa is offered only while
   `mpesa-online?` (MPESA_ONLINE_ENABLED, default true); pay_on_delivery only
   where some delivery method in the zone allows it."
  ([zone] (allowed-payment-methods zone (runtime/mpesa-online?)))
  ([zone mpesa-online?]
   (cond-> []
     mpesa-online?                              (conj "mpesa")
     (some :payOnDeliveryAllowed (:methods zone)) (conj "pay_on_delivery"))))

(defn payment-method-problem
  "Pure server-side policy check for an order. `method` is the chosen delivery
   method (with :payOnDeliveryAllowed). Returns a message string when
   `payment-method` can't be used, else nil."
  [payment-method method mpesa-online?]
  (case payment-method
    "mpesa"            (when-not mpesa-online?
                         "Online M-Pesa isn't available right now. Please choose pay on delivery.")
    "pay_on_delivery"  (when-not (:payOnDeliveryAllowed method)
                         "Pay on delivery isn't available for this delivery option.")
    "That payment method isn't available."))

(defn quote-handler [{:keys [context body-params]}]
  (let [{:keys [county]} (v/validate! QuoteReq body-params)]
    (db/with-tx [conn]
      (let [{:keys [id]} (cart/resolve-cart! conn context)
            c    (cart/present-cart* conn id)
            zone (delivery/zone-for-county conn county)]
        (when (empty? (:items c))
          (throw (err/conflict "conflict" "Your bag is empty." nil)))
        (when-let [probs (seq (stock-problems (:items c)))]
          (throw (err/conflict "out_of_stock" "Some pieces in your bag just changed." (vec probs))))
        (when-not zone
          (throw (err/validation "We don't recognise that county yet."
                                 [{:field "county" :message "unknown county"}])))
        (let [methods   (:methods zone)
              fee       (money/kes (or (some-> methods first :fee money/amount) 0))
              subtotal  (:subtotal c)
              disc      (:discountTotal c)
              total     (money/kes (max 0 (+ (money/amount subtotal)
                                             (money/amount disc)
                                             (money/amount fee))))]
          (resp/ok
           {:zone (:code zone)
            :methods (mapv #(select-keys % [:code :label :fee :eta]) methods)
            :allowedPaymentMethods (allowed-payment-methods zone)
            :cart {:subtotal subtotal
                   :discountTotal disc
                   :deliveryFee fee
                   :total total}}
           resp/cache-quote))))))

(def routes
  [["/checkout/quote" {:post quote-handler}]])
