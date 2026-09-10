(ns house-of-esther.media-test
  "Object-storage sink: R2 PutObject path (S3 client stubbed) and the
   local-disk fallback when MEDIA_S3_ENDPOINT is unset. No DB, no network."
  (:require [clojure.java.io :as io]
            [clojure.test :refer [deftest is testing use-fixtures]]
            [house-of-esther.media :as media]
            [house-of-esther.runtime :as runtime]))

(use-fixtures :each
  (fn [t]
    (let [prior (runtime/config)]
      (try (t)
           (finally
             (runtime/set-config! prior)
             (media/reset-client!))))))

(deftest r2-store-path
  (testing "PutObject is called with the right key + content-type; URL uses MEDIA_BASE_URL"
    (runtime/set-config! {:media {:s3-endpoint          "https://acc.r2.cloudflarestorage.com"
                                  :s3-bucket            "hoe-media"
                                  :s3-access-key-id     "ak"
                                  :s3-secret-access-key "sk"
                                  :base-url             "https://media.houseofesther.co.ke"}})
    (media/reset-client!)
    (let [calls (atom [])]
      (binding [media/*invoke* (fn [op req] (swap! calls conj [op req]) {})]
        (let [full  (media/store-rendition! "img_abc" "2000" (byte-array [1 2 3]))
              thumb (media/store-rendition! "img_abc" "800" (byte-array [4 5]))]
          (is (= "https://media.houseofesther.co.ke/p/img_abc-2000.jpg" full))
          (is (= "https://media.houseofesther.co.ke/p/img_abc-800.jpg" thumb))
          (is (= 2 (count @calls)))
          (let [[op req] (first @calls)]
            (is (= :PutObject op))
            (is (= "hoe-media" (:Bucket req)))
            (is (= "p/img_abc-2000.jpg" (:Key req)))
            (is (= "image/jpeg" (:ContentType req)))
            (is (bytes? (:Body req)))))))))

(deftest s3-client-endpoint-resolves
  (testing "the real aws-api S3 client resolves its endpoint against the R2 host (no network)"
    (runtime/set-config! {:media {:s3-endpoint          "https://acc123.r2.cloudflarestorage.com"
                                  :s3-bucket            "hoe-media"
                                  :s3-access-key-id     "ak"
                                  :s3-secret-access-key "sk"
                                  :s3-region            "us-east-1"
                                  :base-url             "https://media.test"}})
    (media/reset-client!)
    (let [ep (:endpoint (#'media/s3-client))]
      (is (nil? (:cognitect.anomalies/category ep)) (pr-str ep))
      (is (= "acc123.r2.cloudflarestorage.com" (:hostname ep)))
      (is (= "us-east-1" (:region ep))))))

(deftest s3-client-region-auto-is-a-regression
  (testing "'auto' region makes aws-api endpoint resolution fail — documents why config defaults to us-east-1"
    (runtime/set-config! {:media {:s3-endpoint          "https://acc123.r2.cloudflarestorage.com"
                                  :s3-bucket            "b"
                                  :s3-access-key-id     "ak"
                                  :s3-secret-access-key "sk"
                                  :s3-region            "auto"
                                  :base-url             "https://media.test"}})
    (media/reset-client!)
    (let [ep (:endpoint (#'media/s3-client))]
      (is (= :cognitect.anomalies/fault (:cognitect.anomalies/category ep))))))

(deftest r2-put-failure-propagates
  (testing "an S3 anomaly on PutObject throws (admin upload surfaces the error)"
    (runtime/set-config! {:media {:s3-endpoint "https://acc.r2.cloudflarestorage.com"
                                  :s3-bucket "b" :base-url "https://m.test"}})
    (media/reset-client!)
    (binding [media/*invoke* (fn [_ _] {:cognitect.anomalies/category :cognitect.anomalies/fault})]
      (is (thrown? clojure.lang.ExceptionInfo
                   (media/store-rendition! "img_x" "2000" (byte-array [0])))))))

(deftest local-disk-fallback
  (testing "no MEDIA_S3_ENDPOINT -> local write, URL uses CDN_BASE_URL, no S3 call"
    (runtime/set-config! {:media        {}
                          :upload-dir   "target/test-uploads"
                          :cdn-base-url "https://cdn.example.test"})
    (media/reset-client!)
    (let [f (io/file "target/test-uploads/img_local-800.jpg")]
      (.delete f)
      (let [invoked (atom false)]
        (binding [media/*invoke* (fn [_ _] (reset! invoked true) {})]
          (let [url (media/store-rendition! "img_local" "800" (byte-array [9 9 9 9]))]
            (is (false? @invoked) "fallback must not touch the S3 client")
            (is (= "https://cdn.example.test/p/img_local-800.jpg" url))
            (is (.exists f))
            (is (= 4 (.length f)))))))))

(deftest delete-is-best-effort
  (testing "delete-renditions! swallows S3 errors so the DB delete still commits"
    (runtime/set-config! {:media {:s3-endpoint "https://acc.r2.cloudflarestorage.com"
                                  :s3-bucket "b" :base-url "https://m.test"}})
    (media/reset-client!)
    (let [calls (atom [])]
      (binding [media/*invoke* (fn [op req] (swap! calls conj [op req])
                                 (throw (ex-info "boom" {})))]
        (is (nil? (media/delete-renditions! "img_gone")))
        (is (= 2 (count @calls)) "attempts both renditions"))))
  (testing "delete-renditions! is a no-op when R2 is not configured"
    (runtime/set-config! {:media {}})
    (media/reset-client!)
    (binding [media/*invoke* (fn [_ _] (throw (AssertionError. "should not be called")))]
      (is (nil? (media/delete-renditions! "img_gone"))))))
