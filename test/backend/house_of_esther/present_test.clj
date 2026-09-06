(ns house-of-esther.present-test
  (:require [clojure.test :refer [deftest is testing]]
            [house-of-esther.catalog :as catalog]
            [house-of-esther.checkout :as checkout]
            [house-of-esther.present :as present]))

(deftest stock-state
  (is (= "out_of_stock" (present/stock-state {:stock 0 :lowStockThreshold 2 :enabled true})))
  (is (= "out_of_stock" (present/stock-state {:stock 5 :lowStockThreshold 2 :enabled false})))
  (is (= "low_stock" (present/stock-state {:stock 2 :lowStockThreshold 2 :enabled true})))
  (is (= "in_stock" (present/stock-state {:stock 9 :lowStockThreshold 2 :enabled true}))))

(deftest availability-shape
  (is (= {:id "v1" :inStock true :stockState "in_stock"}
         (present/variant-availability {:id "v1" :stock 9 :lowStockThreshold 2 :enabled true})))
  (is (= {:id "v1" :inStock false :stockState "low_stock" :quantityAvailable 2}
         (present/variant-availability {:id "v1" :stock 2 :lowStockThreshold 2 :enabled true}))))

(deftest sale-flag
  (is (present/on-sale? 6800 8200))
  (is (not (present/on-sale? 6800 nil)))
  (is (not (present/on-sale? 6800 6000))))

(deftest colour-hex
  (is (= "#1A1A1A" (present/colour->hex "Black")))
  (is (= "#8A8A8A" (present/colour->hex "Chartreuse"))))

(deftest list-query-is-pure-sql
  (let [{:keys [rows count]} (catalog/build-list-query
                              {:category "women" :sort "price_asc"}
                              {:offset 0 :page-size 24})]
    (is (re-find #"status = 'published'" (first rows)))
    (is (re-find #"order by p.base_price_amount asc" (first rows)))
    (is (= "women" (second rows)))
    (is (re-find #"count\(\*\)" (first count)))))

(deftest payment-methods-by-zone
  (is (= ["mpesa" "pay_on_delivery"]
         (checkout/allowed-payment-methods {:methods [{:payOnDeliveryAllowed true}]})))
  (is (= ["mpesa"]
         (checkout/allowed-payment-methods {:methods [{:payOnDeliveryAllowed false}]}))))

(deftest checkout-stock-problems
  (testing "flags out-of-stock and over-quantity lines"
    (let [probs (checkout/stock-problems
                 [{:variantId "a" :name "A" :stockState "out_of_stock" :quantity 1}
                  {:variantId "b" :name "B" :stockState "low_stock" :quantity 5 :quantityAvailable 2}
                  {:variantId "c" :name "C" :stockState "in_stock" :quantity 1}])]
      (is (= 2 (count probs)))
      (is (= #{"a" "b"} (set (map :field probs)))))))
