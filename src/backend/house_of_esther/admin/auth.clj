(ns house-of-esther.admin.auth
  "A1 — admin auth. Separate cookie (`he_admin_session`), stricter lockout,
   no self-registration. Role is re-checked from the DB on every admin call
   (see middleware/require-admin)."
  (:require [buddy.hashers :as hashers]
            [clojure.string :as str]
            [house-of-esther.obs :as obs]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.runtime :as runtime]
            [house-of-esther.auth.session :as session]))

(def ^:private LoginReq [:map [:email v/Email] [:password :string]])

(defn login [{:keys [body-params]}]
  (let [{:keys [email password]} (v/validate! LoginReq body-params)
        email (str/lower-case (str/trim email))]
    (db/with-tx [conn]
      (let [u (db/q1 conn ["select id, name, email, role, password_hash as \"passwordHash\"
                            from admin_users where email = ? and role = 'admin'" email])]
        (when-not (and u (:valid (hashers/verify password (:passwordHash u))))
          (obs/warnw "admin.login.failed" :email email)
          (throw (err/unauthorized "That email or password doesn't match.")))
        (let [{sid :id} (session/create! conn :admin (:id u) 1)]
          (-> (resp/ok {:user {:id (:id u) :name (:name u) :role (:role u)}})
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
  (if-let [a (:admin context)]
    (resp/ok {:user {:id (:id a) :name (:name a) :role (:role a)}})
    (throw (err/unauthorized "Admin sign-in required."))))

(def routes
  [["/auth/login" {:post login}]
   ["/auth/logout" {:post logout}]
   ["/auth/me" {:get me}]])
