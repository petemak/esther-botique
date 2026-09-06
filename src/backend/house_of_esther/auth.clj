(ns house-of-esther.auth
  "D17 auth + D18 password reset. httpOnly Secure SameSite=Lax session cookie;
   guest cart merged on login/register."
  (:require [buddy.hashers :as hashers]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [house-of-esther.obs :as obs]
            [house-of-esther.cart :as cart]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.notify :as notify]
            [house-of-esther.runtime :as runtime]
            [house-of-esther.auth.session :as session]
            [house-of-esther.util :as u]))

(def ^:private common-passwords
  (delay (with-open [r (io/reader (io/resource "common-passwords.txt"))]
           (into #{} (map str/trim) (line-seq r)))))

(defn check-password-strength! [pw]
  (when (or (nil? pw) (< (count pw) 8))
    (throw (err/validation "Use at least 8 characters."
                           [{:field "password" :message "minimum 8 characters"}])))
  (when (contains? @common-passwords (str/lower-case pw))
    (throw (err/validation "That password is too common — pick something less guessable."
                           [{:field "password" :message "too common"}]))))

(defn- user-public [u]
  {:id (:id u) :firstName (:firstName u) :email (:email u) :phone (:phone u)})

(defn- set-session-cookie [resp cookie-name session-id]
  (let [{:keys [cookie-secure? session-ttl-days]} (runtime/config)]
    (assoc-in resp [:cookies cookie-name]
              {:value session-id :path "/" :http-only true
               :secure (boolean cookie-secure?) :same-site :lax
               :max-age (* 60 60 24 (or session-ttl-days 30))})))

;; --- register ---------------------------------------------------

(def ^:private RegisterReq
  [:map [:firstName v/NonBlank] [:email v/Email] [:phone v/Phone] [:password :string]])

(defn register [{:keys [body-params context]}]
  (let [{:keys [firstName email phone password]} (v/validate! RegisterReq body-params)
        email (str/lower-case (str/trim email))]
    (check-password-strength! password)
    (db/with-tx [conn]
      (when (db/q1 conn ["select 1 from users where email = ?" email])
        (throw (err/conflict "conflict" "That email is already registered. Try signing in." nil)))
      (let [id (u/prefixed-id "usr")]
        (db/exec! conn ["insert into users (id, first_name, email, phone, password_hash) values (?,?,?,?,?)"
                        id firstName email phone (hashers/derive password)])
        (let [{sid :id} (session/create! conn :customer id (:session-ttl-days (runtime/config)))]
          (cart/merge-guest-cart! conn id (:cart-id context))
          (let [u (db/q1 conn ["select id, first_name as \"firstName\", email, phone from users where id = ?" id])]
            (-> (resp/created {:user (user-public u)})
                (set-session-cookie session/customer-cookie sid))))))))

;; --- login ----------------------------------------------------

(def ^:private LoginReq [:map [:email v/Email] [:password :string]])

(defn login [{:keys [body-params context]}]
  (let [{:keys [email password]} (v/validate! LoginReq body-params)
        email (str/lower-case (str/trim email))]
    (db/with-tx [conn]
      (let [u (db/q1 conn ["select id, first_name as \"firstName\", email, phone, password_hash as \"passwordHash\" from users where email = ?" email])]
        (when-not (and u (:valid (hashers/verify password (:passwordHash u))))
          (obs/infow "auth.login.failed" :email email)
          (throw (err/unauthorized "That email or password doesn't match.")))
        (let [{sid :id} (session/create! conn :customer (:id u) (:session-ttl-days (runtime/config)))]
          (cart/merge-guest-cart! conn (:id u) (:cart-id context))
          (-> (resp/ok {:user (user-public u)})
              (set-session-cookie session/customer-cookie sid)))))))

(defn logout [{:keys [cookies]}]
  (db/with-tx [conn]
    (session/delete! conn (get-in cookies [session/customer-cookie :value])))
  (-> resp/no-content
      (assoc-in [:cookies session/customer-cookie]
                {:value "" :path "/" :max-age 0 :http-only true})))

(defn me [{:keys [context]}]
  (if-let [u (:user context)]
    (resp/ok {:user (user-public u)})
    (throw (err/unauthorized))))

;; --- password reset -----------------------------------------

(def ^:private ForgotReq [:map [:email v/Email]])

(defn forgot [{:keys [body-params]}]
  (let [{:keys [email]} (v/validate! ForgotReq body-params)
        email (str/lower-case (str/trim email))]
    (db/with-tx [conn]
      (when-let [u (db/q1 conn ["select id from users where email = ?" email])]
        (let [tok (u/token)]
          (db/exec! conn ["insert into password_reset_tokens (token, user_id, expires_at) values (?, ?, now() + interval '1 hour')"
                          tok (:id u)])
          (notify/enqueue! conn :password-reset {:email email :token tok}))))
    (resp/ok {:message "If that email is registered, a reset link is on its way."})))

(def ^:private ResetReq [:map [:token v/NonBlank] [:password :string]])

(defn reset [{:keys [body-params]}]
  (let [{:keys [token password]} (v/validate! ResetReq body-params)]
    (check-password-strength! password)
    (db/with-tx [conn]
      (let [row (db/q1 conn ["select token, user_id as \"userId\", expires_at as \"expiresAt\", used_at as \"usedAt\"
                              from password_reset_tokens where token = ?" token])]
        (when (or (nil? row) (:usedAt row)
                  (.before ^java.sql.Timestamp (:expiresAt row) (java.sql.Timestamp. (System/currentTimeMillis))))
          (throw (err/ex 422 "reset_token_invalid" "That reset link has expired. Request a new one.")))
        (db/exec! conn ["update users set password_hash = ?, updated_at = now() where id = ?"
                        (hashers/derive password) (:userId row)])
        (db/exec! conn ["update password_reset_tokens set used_at = now() where token = ?" token])
        (db/exec! conn ["delete from sessions where kind = 'customer' and user_id = ?" (:userId row)])
        (resp/ok {:message "Password updated. You can sign in now."})))))

(def routes
  [["/auth/register" {:post register}]
   ["/auth/login"    {:post login}]
   ["/auth/logout"   {:post logout}]
   ["/auth/me"       {:get me}]
   ["/auth/password/forgot" {:post forgot}]
   ["/auth/password/reset"  {:post reset}]])
