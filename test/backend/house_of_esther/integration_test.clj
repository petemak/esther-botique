(ns house-of-esther.integration-test
  "End-to-end tests that hit the full ring stack (muuntaja + reitit + auth +
   CSRF + db). They run only when DATABASE_URL is set — otherwise they no-op so
   the default `:test` run stays green without Postgres.

   With a database:  DATABASE_URL=... SEED_ADMIN_PASSWORD=... clojure -X:test"
  (:require [clojure.string :as str]
            [clojure.test :refer [deftest is testing use-fixtures]]
            [jsonista.core :as j]
            [house-of-esther.config :as config]
            [house-of-esther.db :as db]
            [house-of-esther.migrate :as migrate]
            [house-of-esther.router :as router]
            [house-of-esther.runtime :as runtime]
            [house-of-esther.seed :as seed])
  (:import [java.io ByteArrayInputStream]))

(def ^:dynamic *handler* nil)
(def db-url (System/getenv "DATABASE_URL"))

(def ^:private mapper (j/object-mapper {:decode-key-fn keyword}))

(defn- cookie-header [jar]
  (when (seq jar) (str/join "; " (for [[k v] jar] (str k "=" v)))))

(defn- collect-cookies [jar resp]
  (reduce (fn [m sc]
            (let [[kv] (str/split sc #";" 2)
                  [k v] (str/split kv #"=" 2)]
              (assoc m k v)))
          jar
          (let [h (get-in resp [:headers "Set-Cookie"])]
            (cond (nil? h) [] (string? h) [h] :else h))))

(defn- call
  [{:keys [method uri body jar headers]}]
  (let [[path qs] (str/split uri #"\?" 2)
        resp (*handler*
              {:request-method method
               :uri path
               :query-string qs
               :remote-addr "203.0.113.7"
               :headers (cond-> (merge {"accept" "application/json"} headers)
                          body (assoc "content-type" "application/json")
                          (cookie-header jar) (assoc "cookie" (cookie-header jar)))
               :body (when body (ByteArrayInputStream. (.getBytes (j/write-value-as-string body) "UTF-8")))})
        parsed (let [b (:body resp)]
                 (cond (nil? b) nil
                       (string? b) (try (j/read-value b mapper) (catch Exception _ b))
                       (instance? java.io.InputStream b) (j/read-value b mapper)
                       :else b))]
    {:status (:status resp) :body parsed :jar (collect-cookies jar resp) :raw resp}))

(use-fixtures :once
  (fn [t]
    (if-not db-url
      (println "\n[integration-test] DATABASE_URL not set — skipping end-to-end tests.")
      (let [cfg (assoc (config/load-config) :run-migrations? false :cookie-secure? false)]
        (runtime/set-config! cfg)
        (db/start-pool! cfg)
        (migrate/migrate! (:database-url cfg))
        (db/with-tx [c]
          (doseq [tbl ["order_activity_log" "order_notes" "agreement_acceptances" "payments"
                       "order_items" "orders" "cart_items" "carts" "reviews" "wishlist_items"
                       "addresses" "inventory_adjustments" "idempotency_keys" "sessions"
                       "contact_messages" "product_variants" "products"]]
            (db/exec! c [(str "delete from " tbl)]))
          (db/exec! c ["delete from users"])
          (db/exec! c ["alter sequence order_number_seq restart with 4871"])
          (seed/seed! c cfg))
        (binding [*handler* (router/handler cfg)]
          (t))
        (db/stop-pool!)))))

(defn- admin-login []
  (let [{:keys [jar]} (call {:method :get :uri "/api/admin/auth/me"})
        csrf (get jar "he_csrf")
        r (call {:method :post :uri "/api/admin/auth/login"
                 :jar jar :headers {"x-csrf-token" csrf}
                 :body {:email (:admin-email (:seed (config/load-config)))
                        :password (:admin-password (:seed (config/load-config)))}})]
    r))

(deftest cold-csrf-then-admin-login
  (when db-url
    (testing "a fresh visitor gets he_csrf even on the 401 from /admin/auth/me"
      (let [me (call {:method :get :uri "/api/admin/auth/me"})]
        (is (= 401 (:status me)))
        (is (some? (get (:jar me) "he_csrf")) "he_csrf cookie issued on the 401")
        (testing "and can immediately log in with that token"
          (let [csrf (get (:jar me) "he_csrf")
                login (call {:method :post :uri "/api/admin/auth/login"
                             :jar (:jar me) :headers {"x-csrf-token" csrf}
                             :body {:email (:admin-email (:seed (config/load-config)))
                                    :password (:admin-password (:seed (config/load-config)))}})]
            (is (= 200 (:status login)))
            (is (= "owner" (get-in login [:body :user :role])))
            (is (false? (get-in login [:body :mustChangePassword])))))))))

(deftest admin-create-product-with-options
  (when db-url
    (testing "POST /api/admin/products accepts real variant option maps -> 201"
      (let [{:keys [jar]} (admin-login)
            csrf (get jar "he_csrf")
            resp (call {:method :post :uri "/api/admin/products"
                        :jar jar :headers {"x-csrf-token" csrf}
                        :body {:name "Test Sand Shirt" :slug "test-sand-shirt"
                               :category "women" :subcategory "tops"
                               :basePrice {:amount 4200 :currency "KES"}
                               :variants [{:options {"Size" "S" "Colour" "Sand"}
                                           :sku "TSS-SND-S"
                                           :price {:amount 4200 :currency "KES"}
                                           :stock 4}
                                          {:options {"Size" "M" "Colour" "Sand"}
                                           :sku "TSS-SND-M"
                                           :price {:amount 4200 :currency "KES"}
                                           :stock 6}]
                               :status "draft"}})]
        (is (= 201 (:status resp)))
        (is (= 2 (count (get-in resp [:body :variants]))))
        (is (= {:Size "S" :Colour "Sand"}
               (:options (first (get-in resp [:body :variants])))))))))

(deftest admin-patch-product-adds-variant
  (when db-url
    (let [{:keys [jar]} (admin-login)
          csrf (get jar "he_csrf")
          prod (:body (call {:method :get :uri "/api/admin/products?q=harlan" :jar jar}))
          pid  (:id (first (:items prod)))
          patched (call {:method :patch :uri (str "/api/admin/products/" pid)
                         :jar jar :headers {"x-csrf-token" csrf}
                         :body {:variants [{:options {"Colour" "Oxblood" "Size" "One size"}
                                            :sku "HAR-CB-OXB-OS"
                                            :price {:amount 7200 :currency "KES"}
                                            :stock 3}]}})]
      (is (= 200 (:status patched)))
      (is (some #(= "HAR-CB-OXB-OS" (:sku %)) (get-in patched [:body :variants]))
          "PATCH added the new variant"))))

(deftest order-records-ip-and-saves-address
  (when db-url
    (let [;; register a customer
          reg-jar (:jar (call {:method :get :uri "/api/auth/me"}))
          csrf (get reg-jar "he_csrf")
          reg (call {:method :post :uri "/api/auth/register"
                     :jar reg-jar :headers {"x-csrf-token" csrf}
                     :body {:firstName "Amina" :email "amina.itest@example.com"
                            :phone "+254712345123" :password "s3cure-Pass-99"}})
          jar (:jar reg)
          csrf (get jar "he_csrf")
          _ (call {:method :post :uri "/api/cart/items" :jar jar :headers {"x-csrf-token" csrf}
                   :body {:variantId "var_kito_nat" :quantity 1}})
          quote (call {:method :post :uri "/api/checkout/quote" :jar jar :headers {"x-csrf-token" csrf}
                       :body {:county "Nairobi" :town "Kilimani"}})
          total (get-in quote [:body :cart :total])
          order (call {:method :post :uri "/api/orders" :jar jar
                       :headers {"x-csrf-token" csrf "idempotency-key" "itest-key-1"}
                       :body {:contact {:email "amina.itest@example.com" :phone "+254712345123" :firstName "Amina"}
                              :deliveryAddress {:recipientName "Amina W." :phone "+254712345123"
                                                :county "Nairobi" :town "Kilimani"
                                                :instructions "call on arrival" :saveToAccount true}
                              :deliveryMethodCode "nairobi_next_day"
                              :paymentMethod "pay_on_delivery"
                              :agreementAcceptance {:accepted true :termsOfSaleVersion 4 :returnsPolicyVersion 2}
                              :clientTotal total}})]
      (is (= 201 (:status order)) (pr-str (:body order)))
      (let [acc-id (get-in order [:body :agreementAcceptanceId])
            row (db/q1 ["select ip_address as \"ip\", user_agent as \"ua\" from agreement_acceptances where id = ?" acc-id])]
        (is (= "203.0.113.7" (:ip row)) "client IP recorded on the acceptance row"))
      (testing "saveToAccount persisted the address"
        (let [addrs (call {:method :get :uri "/api/account/addresses" :jar jar})]
          (is (= 1 (count (get-in addrs [:body :items]))))
          (is (true? (get-in addrs [:body :items 0 :isDefault]))))))))

;; --- A3 draft-product preview -----------------------------------

(deftest admin-product-preview-draft
  (when db-url
    (testing "unauthenticated -> 401"
      (let [r (call {:method :get :uri "/api/admin/products/prod_draft/preview"})]
        (is (= 401 (:status r)))))
    (testing "admin gets the storefront ProductDetail shape for a draft product"
      (let [{:keys [jar]} (admin-login)
            r (call {:method :get :uri "/api/admin/products/prod_draft/preview" :jar jar})
            b (:body r)]
        (is (= 200 (:status r)))
        (is (= "draft" (:previewStatus b)))
        (is (= "no-store" (get-in r [:raw :headers "Cache-Control"])))
        ;; exact PDP shape markers
        (is (vector? (:breadcrumbs b)))
        (is (contains? b :story))
        (is (contains? b :care))
        (is (contains? b :sizeGuideCategory))
        (is (contains? b :seo))
        (is (every? #(contains? % :stockState) (:variants b)))
        (is (every? #(contains? % :fullUrl) (:images b))))
      (testing "unknown id -> 404"
        (let [{:keys [jar]} (admin-login)
              r (call {:method :get :uri "/api/admin/products/prod_nope/preview" :jar jar})]
          (is (= 404 (:status r)))
          (is (= "not_found" (get-in r [:body :error :code])))))
      (testing "public PDP still 404s for the same draft product"
        (let [r (call {:method :get :uri "/api/products/nia-cropped-jacket"})]
          (is (= 404 (:status r))))))))

;; --- A15 contact inbox -----------------------------------------

(defn- submit-contact [jar csrf topic order-no msg]
  (call {:method :post :uri "/api/contact" :jar jar :headers {"x-csrf-token" csrf}
         :body (cond-> {:name "Test Person" :email "tester@example.com" :phone "+254700000000"
                        :topic topic :message msg :website ""}
                 order-no (assoc :orderNumber order-no))}))

(deftest admin-contacts-list-filter-and-patch
  (when db-url
    (let [pub-jar (:jar (call {:method :get :uri "/api/auth/me"}))
          pub-csrf (get pub-jar "he_csrf")
          long-msg (apply str "My delivery ETA passed and I want to return the Orin Linen Dress " (repeat 6 "because it did not fit at all "))
          r1 (submit-contact pub-jar pub-csrf "return" "HE-2026-04871" long-msg)
          _  (submit-contact pub-jar pub-csrf "wholesale_press" nil "Do you do wholesale?")
          ref1 (get-in r1 [:body :reference])
          {:keys [jar]} (admin-login)]

      (testing "POST /api/contact persisted the rows"
        (is (= 201 (:status r1)))
        (is (re-matches #"MSG-\d{4}-\d{4}" ref1)))

      (testing "unauthenticated list -> 401"
        (is (= 401 (:status (call {:method :get :uri "/api/admin/contacts"})))))

      (testing "list envelope + excerpt + no-store"
        (let [r (call {:method :get :uri "/api/admin/contacts" :jar jar})
              b (:body r)]
          (is (= 200 (:status r)))
          (is (= "no-store" (get-in r [:raw :headers "Cache-Control"])))
          (is (every? b [:items :page :pageSize :total :totalPages]))
          (is (= 2 (:total b)))
          (let [item (first (filter #(= ref1 (:reference %)) (:items b)))]
            (is (<= (count (:messageExcerpt item)) 124))
            (is (str/ends-with? (:messageExcerpt item) "..."))
            (is (= "HE-2026-04871" (:orderNumber item)))
            (is (false? (:handled item)))
            (is (nil? (:handledAt item))))))

      (testing "filter by topic"
        (let [b (:body (call {:method :get :uri "/api/admin/contacts?topic=return" :jar jar}))]
          (is (= 1 (:total b)))
          (is (= "return" (:topic (first (:items b)))))))

      (testing "filter by handled"
        (is (= 2 (:total (:body (call {:method :get :uri "/api/admin/contacts?handled=false" :jar jar})))))
        (is (= 0 (:total (:body (call {:method :get :uri "/api/admin/contacts?handled=true" :jar jar}))))))

      (testing "invalid topic filter -> 422"
        (is (= 422 (:status (call {:method :get :uri "/api/admin/contacts?topic=nope" :jar jar})))))

      (testing "GET detail returns full body + handledBy, unknown ref -> 404"
        (let [b (:body (call {:method :get :uri (str "/api/admin/contacts/" ref1) :jar jar}))]
          (is (= long-msg (:message b)))
          (is (contains? b :handledBy)))
        (is (= 404 (:status (call {:method :get :uri "/api/admin/contacts/MSG-2026-9999" :jar jar})))))

      (testing "PATCH handled:true sets handledAt + handledBy"
        (let [csrf (get jar "he_csrf")
              r (call {:method :patch :uri (str "/api/admin/contacts/" ref1) :jar jar
                       :headers {"x-csrf-token" csrf} :body {:handled true}})
              b (:body r)]
          (is (= 200 (:status r)))
          (is (true? (:handled b)))
          (is (some? (:handledAt b)))
          (is (= "usr_admin1" (:handledBy b)))
          (is (= 1 (:total (:body (call {:method :get :uri "/api/admin/contacts?handled=true" :jar jar})))))))

      (testing "PATCH handled:false clears them"
        (let [csrf (get jar "he_csrf")
              b (:body (call {:method :patch :uri (str "/api/admin/contacts/" ref1) :jar jar
                              :headers {"x-csrf-token" csrf} :body {:handled false}}))]
          (is (false? (:handled b)))
          (is (nil? (:handledAt b)))
          (is (nil? (:handledBy b)))))

      (testing "PATCH with a bad body -> 422"
        (let [csrf (get jar "he_csrf")]
          (is (= 422 (:status (call {:method :patch :uri (str "/api/admin/contacts/" ref1) :jar jar
                                     :headers {"x-csrf-token" csrf} :body {:handled "yes"}})))))
        (let [csrf (get jar "he_csrf")]
          (is (= 422 (:status (call {:method :patch :uri (str "/api/admin/contacts/" ref1) :jar jar
                                     :headers {"x-csrf-token" csrf} :body {:foo 1}}))))))

      (testing "PATCH unknown reference -> 404"
        (let [csrf (get jar "he_csrf")]
          (is (= 404 (:status (call {:method :patch :uri "/api/admin/contacts/MSG-2026-9999" :jar jar
                                     :headers {"x-csrf-token" csrf} :body {:handled true}})))))))))
