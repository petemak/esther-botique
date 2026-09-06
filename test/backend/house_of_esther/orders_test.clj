(ns house-of-esther.orders-test
  (:require [clojure.test :refer [deftest is testing]]
            [house-of-esther.orders :as orders]))

(deftest transitions
  (testing "forward moves along the chain are legal"
    (is (orders/valid-transition? "placed" "confirmed"))
    (is (orders/valid-transition? "confirmed" "dispatched"))
    (is (orders/valid-transition? "packed" "delivered")))
  (testing "backwards is not, except to cancelled"
    (is (not (orders/valid-transition? "dispatched" "packed")))
    (is (not (orders/valid-transition? "delivered" "dispatched")))
    (is (orders/valid-transition? "confirmed" "cancelled"))
    (is (not (orders/valid-transition? "delivered" "cancelled"))))
  (testing "no-op is rejected"
    (is (not (orders/valid-transition? "placed" "placed")))))

(deftest timeline
  (let [t (orders/default-timeline "2026-09-06T14:31:00Z")]
    (is (= 6 (count t)))
    (is (= "2026-09-06T14:31:00Z" (:at (first t))))
    (is (every? nil? (map :at (rest t)))))
  (testing "advancing stamps the matching step"
    (let [t (orders/advance-timeline (orders/default-timeline "x") "confirmed" "2026-09-06T15:02:00Z")]
      (is (= "2026-09-06T15:02:00Z" (:at (second t)))))))

(deftest masking
  (is (= "a***@gmail.com" (orders/mask-email "amina@gmail.com")))
  (is (= "+2547*****123" (orders/mask-phone "+254712345123"))))

(deftest cancellable
  (is (orders/cancellable? "placed"))
  (is (orders/cancellable? "confirmed"))
  (is (not (orders/cancellable? "dispatched"))))
