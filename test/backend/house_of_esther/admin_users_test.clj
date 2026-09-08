(ns house-of-esther.admin-users-test
  "A16 — admin team management + A1 admin-auth deltas. DB-gated: runs only when
   DATABASE_URL is set, otherwise no-ops so the default `:test` run stays green.

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
      (println "\n[admin-users-test] DATABASE_URL not set — skipping A16 tests.")
      (let [cfg (assoc (config/load-config) :run-migrations? false :cookie-secure? false)]
        (runtime/set-config! cfg)
        (db/start-pool! cfg)
        (migrate/migrate! (:database-url cfg))
        (db/with-tx [c]
          (db/exec! c ["delete from sessions"])
          (db/exec! c ["delete from admin_users"])
          (seed/seed! c cfg))
        (binding [*handler* (router/handler cfg)]
          (t))
        (db/stop-pool!)))))

(use-fixtures :each
  (fn [t]
    (when db-url
      ;; each deftest starts from a clean team: only the seeded owner, no sessions
      (db/with-tx [c]
        (db/exec! c ["delete from sessions"])
        (db/exec! c ["delete from admin_users where id <> 'usr_admin1'"])
        (db/exec! c ["update admin_users
                      set role = 'owner', status = 'active',
                          must_change_password = false, last_login_at = null
                      where id = 'usr_admin1'"])))
    (t)))

;; --- helpers ----------------------------------------------------------------

(defn- fresh-jar []
  (:jar (call {:method :get :uri "/api/admin/auth/me"})))

(defn- login-as [email password]
  (let [jar (fresh-jar)
        csrf (get jar "he_csrf")
        r (call {:method :post :uri "/api/admin/auth/login"
                 :jar jar :headers {"x-csrf-token" csrf}
                 :body {:email email :password password}})]
    (assoc r :jar (:jar r) :csrf (get (:jar r) "he_csrf"))))

(defn- owner-session []
  (login-as (:admin-email (:seed (config/load-config)))
            (:admin-password (:seed (config/load-config)))))

(defn- post [{:keys [jar csrf]} uri body]
  (call {:method :post :uri uri :jar jar :headers {"x-csrf-token" csrf} :body body}))

(defn- patch [{:keys [jar csrf]} uri body]
  (call {:method :patch :uri uri :jar jar :headers {"x-csrf-token" csrf} :body body}))

(defn- get* [{:keys [jar]} uri]
  (call {:method :get :uri uri :jar jar}))

(def ^:private strong-pw "Temp-Handover-2026")

(defn- mk-admin! [sess name email role]
  (post sess "/api/admin/users"
        {:name name :email email :role role :initialPassword strong-pw}))

;; --- tests ----------------------------------------------------------------

(deftest owner-lists-creates-patches
  (when db-url
    (let [sess (owner-session)]
      (testing "GET /api/admin/users — wrapped, newest first, no-store"
        (let [r (get* sess "/api/admin/users")]
          (is (= 200 (:status r)))
          (is (= "no-store" (get-in r [:raw :headers "Cache-Control"])))
          (is (vector? (get-in r [:body :items])))
          (is (some #(= "usr_admin1" (:id %)) (get-in r [:body :items])))))

      (testing "POST creates an active staff, mustChangePassword=true, lastLoginAt=null"
        (let [r (mk-admin! sess "Miriam Otieno" "miriam.a16@houseofesther.co.ke" "staff")
              b (:body r)]
          (is (= 201 (:status r)))
          (is (= "staff" (:role b)))
          (is (= "active" (:status b)))
          (is (true? (:mustChangePassword b)))
          (is (nil? (:lastLoginAt b)))
          (is (not (contains? b :passwordHash)))
          (is (not (contains? b :password_hash)))))

      (testing "newest first"
        (let [items (get-in (get* sess "/api/admin/users") [:body :items])]
          (is (= "miriam.a16@houseofesther.co.ke" (:email (first items))))))

      (testing "PATCH name + role -> 200"
        (let [id (:id (:body (mk-admin! sess "Temp Edit" "tempedit.a16@houseofesther.co.ke" "staff")))
              r (patch sess (str "/api/admin/users/" id) {:name "Temp E." :role "owner"})]
          (is (= 200 (:status r)))
          (is (= "Temp E." (get-in r [:body :name])))
          (is (= "owner" (get-in r [:body :role]))))))))

(deftest duplicate-email-conflicts
  (when db-url
    (let [sess (owner-session)]
      (mk-admin! sess "Dup One" "dup.a16@houseofesther.co.ke" "staff")
      (testing "same email -> 409 email_taken"
        (let [r (mk-admin! sess "Dup Two" "dup.a16@houseofesther.co.ke" "staff")]
          (is (= 409 (:status r)))
          (is (= "email_taken" (get-in r [:body :error :code])))))
      (testing "different case, same email -> 409 email_taken"
        (let [r (mk-admin! sess "Dup Three" "DUP.a16@HouseOfEsther.co.ke" "staff")]
          (is (= 409 (:status r)))
          (is (= "email_taken" (get-in r [:body :error :code])))))
      (testing "duplicate against a DISABLED row still -> 409"
        (let [id (:id (:body (mk-admin! sess "Will Disable" "willdisable.a16@houseofesther.co.ke" "staff")))]
          (patch sess (str "/api/admin/users/" id) {:status "disabled"})
          (let [r (mk-admin! sess "Reuse" "willdisable.a16@houseofesther.co.ke" "staff")]
            (is (= 409 (:status r)))
            (is (= "email_taken" (get-in r [:body :error :code])))))))))

(deftest weak-initial-password-rejected
  (when db-url
    (let [sess (owner-session)
          r (post sess "/api/admin/users"
                  {:name "Weak" :email "weak.a16@houseofesther.co.ke"
                   :role "staff" :initialPassword "1234567"})]
      (is (= 422 (:status r)))
      (is (= "validation_error" (get-in r [:body :error :code]))))))

(deftest last-owner-guardrails
  (when db-url
    (let [sess (owner-session)]
      (testing "demote the last active owner -> 409 last_owner"
        (let [r (patch sess "/api/admin/users/usr_admin1" {:role "staff"})]
          (is (= 409 (:status r)))
          (is (= "last_owner" (get-in r [:body :error :code])))))
      (testing "disable the last active owner -> 409 last_owner"
        (let [r (patch sess "/api/admin/users/usr_admin1" {:status "disabled"})]
          (is (= 409 (:status r)))
          (is (= "last_owner" (get-in r [:body :error :code])))))
      (testing "seed owner is untouched"
        (let [items (get-in (get* sess "/api/admin/users") [:body :items])
              me (first (filter #(= "usr_admin1" (:id %)) items))]
          (is (= "owner" (:role me)))
          (is (= "active" (:status me)))))
      (testing "with a 2nd active owner, demoting one -> 200"
        (let [id (:id (:body (mk-admin! sess "Second Owner" "owner2.a16@houseofesther.co.ke" "owner")))
              r (patch sess (str "/api/admin/users/" id) {:role "staff"})]
          (is (= 200 (:status r)))
          (is (= "staff" (get-in r [:body :role])))))
      (testing "with a 2nd active owner, disabling one -> 200"
        (let [id (:id (:body (mk-admin! sess "Third Owner" "owner3.a16@houseofesther.co.ke" "owner")))
              r (patch sess (str "/api/admin/users/" id) {:status "disabled"})]
          (is (= 200 (:status r)))
          (is (= "disabled" (get-in r [:body :status])))))
      (testing "unknown id -> 404"
        (is (= 404 (:status (patch sess "/api/admin/users/usr_nope" {:name "x"})))))
      (testing "bad enum -> 422"
        (is (= 422 (:status (patch sess "/api/admin/users/usr_admin1" {:role "superadmin"})))))
      (testing "empty name -> 422"
        (is (= 422 (:status (patch sess "/api/admin/users/usr_admin1" {:name ""}))))))))

(deftest staff-forbidden-on-every-users-route
  (when db-url
    (let [owner (owner-session)
          email "staffonly.a16@houseofesther.co.ke"
          _ (mk-admin! owner "Staff Only" email "staff")
          staff (login-as email strong-pw)]
      (is (= 200 (:status staff)) "staff can still sign in")
      (is (= "staff" (get-in staff [:body :user :role])))
      (is (true? (get-in staff [:body :mustChangePassword])))
      (testing "403 forbidden on GET / POST / PATCH / reset-password"
        (is (= 403 (:status (get* staff "/api/admin/users"))))
        (let [r (mk-admin! staff "Nope" "nope.a16@houseofesther.co.ke" "staff")]
          (is (= 403 (:status r)))
          (is (= "forbidden" (get-in r [:body :error :code]))))
        (is (= 403 (:status (patch staff "/api/admin/users/usr_admin1" {:name "x"}))))
        (is (= 403 (:status (post staff "/api/admin/users/usr_admin1/reset-password"
                                  {:newPassword strong-pw}))))))))

(deftest disabled-account-cannot-login-and-session-dies
  (when db-url
    (let [owner (owner-session)
          email "willbedisabled.a16@houseofesther.co.ke"
          id (:id (:body (mk-admin! owner "Will Be Disabled" email "staff")))
          ;; the account signs in and holds a live session
          live (login-as email strong-pw)]
      (is (= 200 (:status live)))
      (is (= 200 (:status (call {:method :get :uri "/api/admin/auth/me" :jar (:jar live)}))))
      ;; owner disables the account
      (is (= 200 (:status (patch owner (str "/api/admin/users/" id) {:status "disabled"}))))
      (testing "the live session 401s on its next call"
        (is (= 401 (:status (call {:method :get :uri "/api/admin/auth/me" :jar (:jar live)})))))
      (testing "a fresh login attempt gets the generic 401 (state not disclosed)"
        (let [r (login-as email strong-pw)]
          (is (= 401 (:status r)))
          (is (= "unauthorized" (get-in r [:body :error :code]))))))))

(deftest reset-password-invalidates-sessions
  (when db-url
    (let [owner (owner-session)
          email "resetme.a16@houseofesther.co.ke"
          id (:id (:body (mk-admin! owner "Reset Me" email "staff")))
          live (login-as email strong-pw)]
      (is (= 200 (:status live)))
      (testing "owner reset-password -> 200, mustChangePassword true"
        (let [r (post owner (str "/api/admin/users/" id "/reset-password")
                      {:newPassword "New-Temp-2026-xyz"})]
          (is (= 200 (:status r)))
          (is (true? (get-in r [:body :mustChangePassword])))))
      (testing "target's old session is dead"
        (is (= 401 (:status (call {:method :get :uri "/api/admin/auth/me" :jar (:jar live)})))))
      (testing "weak new password -> 422"
        (is (= 422 (:status (post owner (str "/api/admin/users/" id "/reset-password")
                                  {:newPassword "1234567"})))))
      (testing "unknown id -> 404"
        (is (= 404 (:status (post owner "/api/admin/users/usr_nope/reset-password"
                                  {:newPassword "New-Temp-2026-xyz"}))))))))

(deftest change-password-flow
  (when db-url
    (let [owner (owner-session)
          email "changepw.a16@houseofesther.co.ke"
          _ (mk-admin! owner "Change PW" email "staff")
          staff (login-as email strong-pw)]
      (is (true? (get-in staff [:body :mustChangePassword])))
      (testing "wrong current password -> 422 current_password_incorrect"
        (let [r (post staff "/api/admin/auth/change-password"
                      {:currentPassword "not-the-password" :newPassword "Brand-New-Pw-2026"})]
          (is (= 422 (:status r)))
          (is (= "current_password_incorrect" (get-in r [:body :error :code])))))
      (testing "weak new password -> 422 validation_error"
        (let [r (post staff "/api/admin/auth/change-password"
                      {:currentPassword strong-pw :newPassword "1234567"})]
          (is (= 422 (:status r)))
          (is (= "validation_error" (get-in r [:body :error :code])))))
      (testing "success clears mustChangePassword and keeps the session valid"
        (let [r (post staff "/api/admin/auth/change-password"
                      {:currentPassword strong-pw :newPassword "Brand-New-Pw-2026"})]
          (is (= 200 (:status r)))
          (is (false? (get-in r [:body :mustChangePassword])))
          (is (= "staff" (get-in r [:body :user :role]))))
        (let [me (call {:method :get :uri "/api/admin/auth/me" :jar (:jar staff)})]
          (is (= 200 (:status me)))
          (is (false? (get-in me [:body :mustChangePassword])))))
      (testing "and the new password now logs in"
        (let [r (login-as email "Brand-New-Pw-2026")]
          (is (= 200 (:status r)))
          (is (false? (get-in r [:body :mustChangePassword]))))))))

(deftest login-me-carry-role-and-must-change
  (when db-url
    (let [owner (owner-session)]
      (is (= "owner" (get-in owner [:body :user :role])))
      (is (false? (get-in owner [:body :mustChangePassword])))
      (is (contains? (get-in owner [:body :user]) :email))
      (let [me (call {:method :get :uri "/api/admin/auth/me" :jar (:jar owner)})]
        (is (= "owner" (get-in me [:body :user :role])))
        (is (false? (get-in me [:body :mustChangePassword])))))))
