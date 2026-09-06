(ns house-of-esther.http-test
  (:require [clojure.test :refer [deftest is testing]]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.page :as page]
            [house-of-esther.http.validate :as v]
            [house-of-esther.idempotency :as idem]
            [house-of-esther.util :as u]))

(deftest pagination-defaults
  (is (= {:page 1 :page-size 24 :offset 0} (page/params {})))
  (is (= {:page 3 :page-size 10 :offset 20} (page/params {"page" "3" "pageSize" "10"})))
  (testing "pageSize is capped at the max"
    (is (= 60 (:page-size (page/params {"pageSize" "500"}))))))

(deftest page-envelope
  (is (= {:items [] :page 1 :pageSize 24 :total 137 :totalPages 6}
         (page/wrap [] {:page 1 :page-size 24} 137))))

(deftest error-shape
  (let [r (err/->response (err/validation "bad" [{:field "email" :message "required"}]))]
    (is (= 422 (:status r)))
    (is (= "validation_error" (get-in r [:body :error :code])))
    (is (= [{:field "email" :message "required"}] (get-in r [:body :error :details])))))

(deftest price-changed-carries-preview
  (let [e (ex-info "changed" {:type :house-of-esther.http.error/api-error
                              :status 409 :code "price_changed" :message "changed"
                              :order {:total {:amount 1 :currency "KES"}}})
        r (err/->response e)]
    (is (= 409 (:status r)))
    (is (= "price_changed" (get-in r [:body :error :code])))
    (is (= {:amount 1 :currency "KES"} (get-in r [:body :order :total])))))

(deftest validate-throws-422
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"highlighted"
        (v/validate! [:map [:email v/Email]] {:email "nope"}))))

(deftest idempotency-hash-stable
  (is (= (idem/hash-body {:a 1 :b 2}) (idem/hash-body {:a 1 :b 2})))
  (is (not= (idem/hash-body {:a 1}) (idem/hash-body {:a 2}))))

(deftest validation-details-are-always-strings
  (testing "nested map-of / vector schema failures flatten to {field, string message}"
    (let [schema [:map [:variants [:vector [:map
                                            [:sku [:string {:min 1}]]
                                            [:options [:map-of :keyword :string]]]]]]
          bad    {:variants [{:sku "" :options {:Size 5}}]}]
      (try
        (v/validate! schema bad)
        (is false "should have thrown")
        (catch clojure.lang.ExceptionInfo e
          (let [details (:details (ex-data e))]
            (is (seq details))
            (is (every? string? (map :message details)))
            (is (every? string? (map :field details)))
            (is (some #(re-find #"variants\.0" (:field %)) details))))))))

(deftest option-map-accepts-keyword-keys
  (testing "muuntaja-keywordized option maps pass validation"
    (is (= {:o {:Size "S" :Colour "Sand"}}
           (v/validate! [:map [:o v/OptionMap]] {:o {:Size "S" :Colour "Sand"}})))
    (is (= {:o {"Size" "S"}}
           (v/validate! [:map [:o v/OptionMap]] {:o {"Size" "S"}}))))
  (testing "normalize-options coerces to string keys for storage"
    (is (= {"Size" "S" "Colour" "Sand"} (v/normalize-options {:Size "S" :Colour "Sand"})))
    (is (= {"Size" "S"} (v/normalize-options {"Size" "S"})))))

(deftest client-ip-resolution
  (testing "socket peer by default"
    (is (= "10.0.0.9" (u/client-ip {:remote-addr "10.0.0.9"
                                    :headers {"x-forwarded-for" "1.2.3.4"}} false))))
  (testing "leftmost XFF hop when proxy headers are trusted"
    (is (= "1.2.3.4" (u/client-ip {:remote-addr "10.0.0.9"
                                   :headers {"x-forwarded-for" "1.2.3.4, 10.0.0.1"}} true)))))
