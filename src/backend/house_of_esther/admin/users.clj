(ns house-of-esther.admin.users
  "A16 — Team (admin users). Owner-only: every route here is mounted behind
   `require-admin` + `require-owner`. Removal is deactivation, never deletion, so
   historical actions keep resolving to a name. Guardrails (last active owner)
   are enforced here on the server — the admin UI is not the authority."
  (:require [buddy.hashers :as hashers]
            [clojure.string :as str]
            [house-of-esther.auth :as customer-auth]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.util :as u]))

(def ^:private select-cols
  "id, name, email, role, status,
   must_change_password as \"mustChangePassword\",
   created_at as \"createdAt\", last_login_at as \"lastLoginAt\"")

(defn- iso [t] (some-> t .toInstant u/iso))

(defn- present
  "Row -> the contract `AdminUser` shape. A password hash is never included."
  [row]
  {:id (:id row)
   :name (:name row)
   :email (:email row)
   :role (:role row)
   :status (:status row)
   :mustChangePassword (boolean (:mustChangePassword row))
   :createdAt (iso (:createdAt row))
   :lastLoginAt (iso (:lastLoginAt row))})

(defn- fetch [conn id]
  (db/q1 conn [(str "select " select-cols " from admin_users where id = ?") id]))

(defn- email-taken? [conn email]
  (some? (db/q1 conn ["select 1 from admin_users where lower(email) = ?" email])))

(defn- last-active-owner?
  "True when `row` is the ONLY account with role='owner' AND status='active'."
  [conn row]
  (and (= "owner" (:role row))
       (= "active" (:status row))
       (= 1 (db/one-val conn ["select count(*) from admin_users
                               where role = 'owner' and status = 'active'"]))))

(defn- kill-sessions! [conn id]
  (db/exec! conn ["delete from sessions where kind = 'admin' and user_id = ?" id]))

;; --- GET /api/admin/users -----------------------------------------------------

(defn list-users [_req]
  (db/with-tx [conn]
    (let [rows (db/q conn [(str "select " select-cols
                                " from admin_users order by created_at desc, id desc")])]
      (resp/ok {:items (mapv present rows)}))))

;; --- POST /api/admin/users --------------------------------------------------

(def ^:private CreateReq
  [:map {:closed true}
   [:name [:string {:min 1 :max 120}]]
   [:email v/Email]
   [:role [:enum "owner" "staff"]]
   [:initialPassword :string]])

(defn create-user [{:keys [body-params]}]
  (let [{:keys [name email role initialPassword]} (v/validate! CreateReq body-params)
        email (str/lower-case (str/trim email))]
    ;; same validator as POST /api/auth/register (min 8 + common-passwords.txt)
    (customer-auth/check-password-strength! initialPassword)
    (db/with-tx [conn]
      (when (email-taken? conn email)
        (throw (err/conflict "email_taken"
                             "An admin already uses that email. Reactivate that account instead."
                             nil)))
      (let [id (u/prefixed-id "usr")]
        (db/exec! conn ["insert into admin_users
                         (id, name, email, password_hash, role, status, must_change_password)
                         values (?,?,?,?,?, 'active', true)"
                        id name email (hashers/derive initialPassword) role])
        (resp/created (present (fetch conn id)))))))

;; --- PATCH /api/admin/users/{id} ------------------------------------------

(def ^:private PatchReq
  [:map {:closed true}
   [:name {:optional true} [:string {:min 1 :max 120}]]
   [:role {:optional true} [:enum "owner" "staff"]]
   [:status {:optional true} [:enum "active" "disabled"]]])

(defn patch-user [{:keys [body-params] {:keys [id]} :path-params}]
  (let [changes (v/validate! PatchReq body-params)]
    (db/with-tx [conn]
      (let [target (fetch conn id)]
        (when-not target
          (throw (err/not-found "No admin account with that id.")))
        (let [new-name   (get changes :name (:name target))
              new-role   (get changes :role (:role target))
              new-status (get changes :status (:status target))
              demoting?  (and (= "owner" (:role target)) (= "staff" new-role))
              disabling? (and (= "active" (:status target)) (= "disabled" new-status))]
          (when (and (or demoting? disabling?) (last-active-owner? conn target))
            (throw (err/conflict "last_owner"
                                 "You can't demote or disable the last active owner."
                                 nil)))
          (db/exec! conn ["update admin_users set name = ?, role = ?, status = ? where id = ?"
                          new-name new-role new-status id])
          (when disabling?
            ;; deactivation kills the target's live admin sessions immediately
            (kill-sessions! conn id))
          (resp/ok (present (fetch conn id))))))))

;; --- POST /api/admin/users/{id}/reset-password -----------------------------

(def ^:private ResetReq
  [:map {:closed true} [:newPassword :string]])

(defn reset-password [{:keys [body-params context] {:keys [id]} :path-params}]
  (let [{:keys [newPassword]} (v/validate! ResetReq body-params)]
    ;; An owner changes their OWN password via POST /api/admin/auth/change-password
    ;; (which requires the current password). There is deliberately no self-reset here.
    (when (= id (get-in context [:admin :id]))
      (throw (err/validation
              "Use Change password (with your current password) to update your own." )))
    (db/with-tx [conn]
      (let [target (fetch conn id)]
        (when-not target
          (throw (err/not-found "No admin account with that id.")))
        (customer-auth/check-password-strength! newPassword)
        (db/exec! conn ["update admin_users
                         set password_hash = ?, must_change_password = true
                         where id = ?"
                        (hashers/derive newPassword) id])
        (kill-sessions! conn id)
        (resp/ok (present (fetch conn id)))))))

(def routes
  [["/users" {:get list-users :post create-user}]
   ["/users/:id" {:patch patch-user}]
   ["/users/:id/reset-password" {:post reset-password}]])
