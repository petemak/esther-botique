(ns house-of-esther.http.middleware
  "Cross-cutting HTTP concerns: request context, auth, CSRF, cache-control,
   and the single exception -> error-shape boundary."
  (:require [clojure.tools.logging :as log]
            [house-of-esther.obs :as obs]
            [house-of-esther.auth.session :as session]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.util :as u]))

(defn wrap-exception
  "Turn any thrown error into the standard { error: { code, message } } shape.
   Logs with real context, never a bare print."
  [handler]
  (fn [req]
    (try
      (handler req)
      (catch clojure.lang.ExceptionInfo e
        (if (err/api-error? e)
          (do (obs/infow "api-error"
                         :path (:uri req) :method (:request-method req)
                         :code (:code (ex-data e)) :status (:status (ex-data e)))
              (err/->response e))
          (do (log/error e "unhandled ExceptionInfo" (pr-str {:path (:uri req)}))
              (err/->response (err/internal "Unexpected error")))))
      (catch Throwable e
        (log/error e "unhandled exception" (pr-str {:path (:uri req)
                                                    :method (:request-method req)}))
        (err/->response (err/internal "Unexpected error"))))))

(defn wrap-ensure-csrf
  "Issue the readable `he_csrf` cookie on the FIRST request that lacks it — on
   every response, including throwing 4xx ones. Sits outside the exception
   boundary so a fresh visitor to a protected page (e.g. GET /api/admin/auth/me
   -> 401) still leaves with a token and can make their next mutation.
   The token for this request is stashed at `:he-csrf` for inner middleware."
  [handler {:keys [cookie-secure? session-ttl-days]}]
  (fn [req]
    (let [existing (get-in req [:cookies session/csrf-cookie :value])
          token    (or existing (u/token))
          resp     (handler (assoc req :he-csrf token))]
      (cond-> resp
        (and (map? resp) (nil? existing))
        (assoc-in [:cookies session/csrf-cookie]
                  {:value token :path "/" :http-only false
                   :secure (boolean cookie-secure?) :same-site :lax
                   :max-age (* 60 60 24 (or session-ttl-days 30))})))))

(defn wrap-context
  "Attach request context: authenticated customer, authenticated admin, guest
   cart id."
  [handler _config]
  (fn [req]
    (let [cookie #(get-in req [:cookies % :value])
          conn   (db/ds)
          cust   (session/customer conn (cookie session/customer-cookie))
          adm    (session/admin conn (cookie session/admin-cookie))]
      (handler (assoc req
                      :context {:user cust
                                :admin adm
                                :cart-id (cookie session/cart-cookie)
                                :csrf (:he-csrf req)}
                      :identity cust)))))

(def ^:private mutating #{:post :put :patch :delete})
(def ^:private csrf-exempt-paths #{"/api/payments/mpesa/callback"})

(defn wrap-csrf
  "Double-submit cookie check for mutating requests: the `X-CSRF-Token` header
   must match the `he_csrf` cookie the client was previously issued."
  [handler]
  (fn [{:keys [request-method uri headers] :as req}]
    (if (and (mutating request-method)
             (not (contains? csrf-exempt-paths uri)))
      (let [header (get headers "x-csrf-token")
            cookie (get-in req [:cookies session/csrf-cookie :value])]
        (if (and header cookie (= header cookie))
          (handler req)
          (throw (err/forbidden "Your session needs a refresh. Reload the page and try again."))))
      (handler req))))

(defn require-customer
  "Reitit middleware: 401 unless an authenticated customer is present."
  [handler]
  (fn [req]
    (if (get-in req [:context :user])
      (handler req)
      (throw (err/unauthorized)))))

(defn require-admin
  "Reitit middleware: 401 unless an authenticated admin whose account is still
   `status = 'active'` is present. The account was re-loaded from the DB by
   `wrap-context` on this request, so a mid-session deactivation or password
   reset takes effect on the account's next call (A1/A16)."
  [handler]
  (fn [req]
    (let [adm (get-in req [:context :admin])]
      (if (and adm (= "active" (:status adm)))
        (handler req)
        (throw (err/unauthorized "Admin sign-in required."))))))

(defn require-owner
  "Reitit middleware: composes with `require-admin`; 403 `forbidden` unless the
   signed-in admin has `role = 'owner'`. Wired onto `/api/admin/users*` only."
  [handler]
  (fn [req]
    (let [adm (get-in req [:context :admin])]
      (if (and adm (= "active" (:status adm)))
        (if (= "owner" (:role adm))
          (handler req)
          (throw (err/forbidden "This area is limited to the shop owner.")))
        (throw (err/unauthorized "Admin sign-in required."))))))

(defn wrap-default-cache
  "Anything that didn't declare a Cache-Control gets no-store."
  [handler]
  (fn [req]
    (let [resp (handler req)]
      (if (and (map? resp) (not (get-in resp [:headers "Cache-Control"])))
        (assoc-in resp [:headers "Cache-Control"] "no-store")
        resp))))
