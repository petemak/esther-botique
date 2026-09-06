(ns house-of-esther.cart-test
  (:require [clojure.test :refer [deftest is testing]]
            [house-of-esther.cart :as cart]
            [house-of-esther.money :as money]))

(def base-discount
  {:code "WELCOME10" :type "percent" :value 10 :active true
   :minSpendAmount nil :usageLimitTotal nil :timesUsed 0
   :eligibleCategories [] :startsAt nil :endsAt nil})

(deftest percent-discount
  (is (= (money/kes -680)
         (:amount (cart/compute-discount (money/kes 6800) base-discount ["women"])))))

(deftest fixed-discount
  (let [d (assoc base-discount :type "fixed" :value 1000)]
    (is (= (money/kes -1000)
           (:amount (cart/compute-discount (money/kes 6800) d ["women"]))))
    (testing "never exceeds the subtotal"
      (is (= (money/kes -500)
             (:amount (cart/compute-discount (money/kes 500) d ["women"])))))))

(deftest free-delivery-discount
  (let [d (assoc base-discount :type "free_delivery")]
    (is (= (money/kes 0)
           (:amount (cart/compute-discount (money/kes 6800) d ["women"]))))))

(deftest min-spend-enforced
  (let [d (assoc base-discount :minSpendAmount 8000)]
    (is (thrown? clojure.lang.ExceptionInfo
                 (cart/compute-discount (money/kes 6800) d ["women"])))))

(deftest category-eligibility
  (let [d (assoc base-discount :eligibleCategories ["accessories"])]
    (is (thrown? clojure.lang.ExceptionInfo
                 (cart/compute-discount (money/kes 6800) d ["women"])))
    (is (= (money/kes -680)
           (:amount (cart/compute-discount (money/kes 6800) d ["women" "accessories"]))))))

(deftest inactive-rejected
  (is (thrown? clojure.lang.ExceptionInfo
               (cart/compute-discount (money/kes 6800) (assoc base-discount :active false) ["women"]))))

(deftest usage-limit-reached
  (let [d (assoc base-discount :usageLimitTotal 5 :timesUsed 5)]
    (is (thrown? clojure.lang.ExceptionInfo
                 (cart/compute-discount (money/kes 6800) d ["women"])))))
