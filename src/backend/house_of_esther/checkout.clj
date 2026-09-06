(ns house-of-esther.checkout
  "D10 — delivery quote. Re-prices the current cart and resolves the delivery
   zone from the county. Cache-Control: private, max-age=30."
  (:require [house-of-esther.cart :as cart]
            [house-of-esther.db :as db]
            [house-of-esther.delivery :as delivery]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.money :as money]))

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

(defn allowed-payment-methods [zone]
  (cond-> ["mpesa"]
    (some :payOnDeliveryAllowed (:methods zone)) (conj "pay_on_delivery")))

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
