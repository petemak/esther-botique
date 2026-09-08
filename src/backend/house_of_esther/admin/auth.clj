(ns house-of-esther.admin.auth
  "A1 — admin auth. Separate cookie (`he_admin_session`), stricter lockout,
   no self-registration. Role and status are re-loaded from the DB on every
   admin call (see middleware/require-admin). A `disabled` account is rejected
   with the SAME generic 401 as a bad password — the state is never disclosed."
  (:require [buddy.hashers :as hashers]
            [clojure.string :as str]
            [house-of-esther.auth :as customer-auth]
            [house-of-esther.auth.session :as session]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.middleware :as mw]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.obs :as obs]
            [house-of-esther.runtime :as runtime]))

(def ^:private generic-401 "Those details don't match.")

(defn- me-body
  "The shape shared by login / me / change-password responses (A1)."
  [a]
  {:user {:id (:id a) :name (:name a) :email (:email a) :role (:role a)}
   :mustChangePassword (boolean (:mustChangePassword a))})

(defn- active-admin
  "The signed-in admin, or a generic 401 if absent / no longer active."
  [context]
  (let [a (:admin context)]
    (when-not (and a (= "active" (:status a)))
      (throw (err/unauthorized "Admin sign-in required.")))
    a))

;; --- login ----------------------------------------------------

(def ^:private LoginReq [:map [:email v/Email] [:password :string]])

(defn login [{:keys [body-params]}]
  (let [{:keys [email password]} (v/validate! LoginReq body-params)
        email (str/lower-case (str/trim email))]
    (db/with-tx [conn]
      (let [u (db/q1 conn ["select id, name, email, role, status,
                                   must_change_password as \"mustChangePassword\",
                                   password_hash as \"passwordHash\"
                            from admin_users where lower(email) = ?" email])]
        (when-not (and u
                       (= "active" (:status u))
                       (:valid (hashers/verify password (:passwordHash u))))
          (obs/warnw "admin.login.failed" :email email
                     :reason (cond (nil? u) "unknown"
                                   (not= "active" (:status u)) "disabled"
                                   :else "bad-password"))
          (throw (err/unauthorized generic-401)))
        (db/exec! conn ["update admin_users set last_login_at = now() where id = ?" (:id u)])
        (let [{sid :id} (session/create! conn :admin (:id u) 1)]
          (-> (resp/ok (me-body u))
              (assoc-in [:cookies session/admin-cookie]
                        {:value sid :path "/" :http-only true
                         :secure (boolean (:cookie-secure? (runtime/config)))
                         :same-site :lax :max-age (* 60 60 12)})))))))

(defn logout [{:keys [cookies]}]
  (db/with-tx [conn]
    (session/delete! conn (get-in cookies [session/admin-cookie :value])))
  (-> resp/no-content
      (assoc-in [:cookies session/admin-cookie] {:value "" :path "/" :max-age 0 :http-only true})))

(defn me [{:keys [context]}]
  (resp/ok (me-body (active-admin context))))

;; --- change own password (A1) --------------------------------
;; Any signed-in admin (owner or staff). Requires the current password.
;; NOTE: no per-identity rate-limit helper exists in this codebase yet; when one
;; lands, wrap this handler with it (contract asks for a per-admin rate limit).

(def ^:private ChangePwReq
  [:map {:closed true}
   [:currentPassword :string]
   [:newPassword :string]])

(defn change-password [{:keys [context body-params]}]
  (let [a (active-admin context)
        {:keys [currentPassword newPassword]} (v/validate! ChangePwReq body-params)]
    (db/with-tx [conn]
      (let [row (db/q1 conn ["select password_hash as \"passwordHash\" from admin_users where id = ?" (:id a)])]
        (when-not (:valid (hashers/verify currentPassword (:passwordHash row)))
          (throw (err/ex 422 "current_password_incorrect" "Your current password isn't right.")))
        (customer-auth/check-password-strength! newPassword)
        (db/exec! conn ["update admin_users
                         set password_hash = ?, must_change_password = false
                         where id = ?"
                        (hashers/derive newPassword) (:id a)])
        ;; the current session stays valid — no session wipe here
        (let [fresh (db/q1 conn ["select id, name, email, role, status,
                                         must_change_password as \"mustChangePassword\"
                                  from admin_users where id = ?" (:id a)])]
          (resp/ok (me-body fresh)))))))

(def routes
  [["/auth/login" {:post login}]
   ["/auth/logout" {:post logout}]
   ["/auth/me" {:get me}]
   ["/auth/change-password" {:post change-password :middleware [mw/require-admin]}]])
