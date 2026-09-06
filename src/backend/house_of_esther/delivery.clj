(ns house-of-esther.delivery
  "D11 — delivery zones (also powers the Delivery & Returns fees table)."
  (:require [clojure.string :as str]
            [house-of-esther.db :as db]
            [house-of-esther.http.response :as resp]
            [house-of-esther.money :as money]))

(defn zones-rows [conn]
  (let [zones   (db/q conn ["select code, label, counties, sort_order as \"sortOrder\" from delivery_zones order by sort_order"])
        methods (group-by :zoneCode
                          (db/q conn ["select code, zone_code as \"zoneCode\", label, fee_amount as \"feeAmount\",
                                              eta, pay_on_delivery_allowed as \"payOnDeliveryAllowed\"
                                       from delivery_methods order by sort_order"]))]
    (mapv (fn [z]
            {:code (:code z)
             :label (:label z)
             :counties (:counties z)
             :methods (mapv (fn [m]
                              {:code (:code m) :label (:label m)
                               :fee (money/kes (:feeAmount m))
                               :eta (:eta m)
                               :payOnDeliveryAllowed (boolean (:payOnDeliveryAllowed m))})
                            (get methods (:code z)))})
          zones)))

(defn zone-for-county
  "Return the zone row (with methods) whose counties include `county`, or nil."
  [conn county]
  (let [c (some-> county str/trim str/lower-case)]
    (->> (zones-rows conn)
         (some (fn [z]
                 (when (some #(= (str/lower-case %) c) (:counties z)) z))))))

(defn list-zones [_]
  (db/with-tx [conn]
    (resp/ok {:zones (zones-rows conn)} resp/cache-catalog)))

(def routes
  [["/delivery/zones" {:get list-zones}]])
