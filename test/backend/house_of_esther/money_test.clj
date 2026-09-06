(ns house-of-esther.money-test
  (:require [clojure.test :refer [deftest is testing]]
            [house-of-esther.money :as money]))

(deftest money-shape
  (is (= {:amount 4500 :currency "KES"} (money/kes 4500)))
  (is (= 4500 (money/amount (money/kes 4500))))
  (is (integer? (:amount (money/kes 10.4)))))

(deftest arithmetic
  (is (= (money/kes 300) (money/add (money/kes 100) (money/kes 200))))
  (is (= (money/kes -680) (money/negate (money/kes 680))))
  (is (= (money/kes 6420)
         (money/add (money/kes 6800) (money/negate (money/kes 680)) (money/kes 300)))))

(deftest percent
  (testing "10% of 6800 is 680"
    (is (= (money/kes 680) (money/percent-of (money/kes 6800) 10)))))
