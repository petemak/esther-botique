(ns house-of-esther.auth.session
  "Server-side sessions. Customer and admin sessions are stored in the same
   table but are distinct cookies and distinct `kind`s; the admin role is
   re-checked from the database on every admin call — never inferred from the UI."
  (:require [house-of-esther.db :as db]
            [house-of-esther.util :as u]))

(def customer-cookie "he_session")
(def admin-cookie "he_admin_session")
(def csrf-cookie "he_csrf")
(def cart-cookie "he_cart")

(defn create!
  "Create a session row. `kind` is :customer or :admin. Returns {:id :csrf}."
  [conn kind user-id ttl-days]
  (let [id   (u/token)
        csrf (u/token)]
    (db/exec! conn
              ["insert into sessions (id, kind, user_id, csrf_token, created_at, expires_at)
                values (?, ?, ?, ?, now(), now() + (? || ' days')::interval)"
               id (name kind) user-id csrf (str ttl-days)])
    {:id id :csrf csrf}))

(defn find-valid
  "Look up a live session of the given kind."
  [conn kind id]
  (when id
    (db/q1 conn
           ["select id, kind, user_id as user_id, csrf_token
             from sessions
             where id = ? and kind = ? and expires_at > now()"
            id (name kind)])))

(defn delete! [conn id]
  (when id (db/exec! conn ["delete from sessions where id = ?" id])))

(defn customer
  "Resolve the authenticated customer for a request session id, or nil."
  [conn id]
  (when-let [s (find-valid conn :customer id)]
    (some-> (db/q1 conn
                   ["select id, first_name, last_name, email, phone
                     from users where id = ?" (:userId s)])
            (assoc :session s))))

(defn admin
  "Resolve the authenticated admin user, re-loading role + status from the DB on
   every request (A1/A16). Returns the row even when status = 'disabled' so the
   auth middleware can decide the response; callers must check :status."
  [conn id]
  (when-let [s (find-valid conn :admin id)]
    (some-> (db/q1 conn
                   ["select id, name, email, role, status,
                            must_change_password as \"mustChangePassword\",
                            last_login_at as \"lastLoginAt\"
                     from admin_users where id = ?" (:userId s)])
            (assoc :session s))))
