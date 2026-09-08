(ns house-of-esther.router
  "Assembles every feature's route table into one reitit router and the ring
   handler stack. Routing is reitit; bodies are plain maps encoded by muuntaja."
  (:require [clojure.tools.logging :as log]
            [jsonista.core :as j]
            [muuntaja.core :as m]
            [reitit.ring :as ring]
            [reitit.ring.middleware.muuntaja :as muuntaja]
            [ring.middleware.cookies :refer [wrap-cookies]]
            [ring.middleware.multipart-params :refer [wrap-multipart-params]]
            [ring.middleware.params :refer [wrap-params]]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.middleware :as mw]
            ;; feature slices
            [house-of-esther.account :as account]
            [house-of-esther.auth :as auth]
            [house-of-esther.cart :as cart]
            [house-of-esther.catalog :as catalog]
            [house-of-esther.checkout :as checkout]
            [house-of-esther.contact :as contact]
            [house-of-esther.content :as content]
            [house-of-esther.delivery :as delivery]
            [house-of-esther.journal :as journal]
            [house-of-esther.legal :as legal]
            [house-of-esther.orders :as orders]
            [house-of-esther.payments :as payments]
            [house-of-esther.reviews :as reviews]
            [house-of-esther.search :as search]
            [house-of-esther.subscriptions :as subscriptions]
            [house-of-esther.admin.auth :as admin-auth]
            [house-of-esther.admin.contacts :as admin-contacts]
            [house-of-esther.admin.images :as admin-images]
            [house-of-esther.admin.inventory :as admin-inventory]
            [house-of-esther.admin.marketing :as admin-marketing]
            [house-of-esther.admin.moderation :as admin-moderation]
            [house-of-esther.admin.orders :as admin-orders]
            [house-of-esther.admin.products :as admin-products]
            [house-of-esther.admin.site :as admin-site]
            [house-of-esther.admin.taxonomy :as admin-taxonomy]
            [house-of-esther.admin.users :as admin-users]))

(def ^:private public-routes
  (vec (concat catalog/routes search/routes reviews/routes cart/routes checkout/routes
               delivery/routes legal/routes journal/routes content/routes
               subscriptions/routes contact/routes orders/routes payments/routes auth/routes)))

(def ^:private account-routes
  [(into ["" {:middleware [mw/require-customer]}] account/routes)])

(def ^:private admin-routes
  [(into ["/admin"]
         (concat admin-auth/routes
                 [(into ["" {:middleware [mw/require-admin]}]
                        (concat admin-products/routes admin-images/routes admin-inventory/routes
                                admin-taxonomy/routes admin-orders/routes admin-moderation/routes
                                admin-marketing/routes admin-site/routes admin-contacts/routes))]
                 ;; A16 — owner-only admin team management
                 [(into ["" {:middleware [mw/require-admin mw/require-owner]}]
                        admin-users/routes)]))])

(def routes
  (into ["/api"] (concat public-routes account-routes admin-routes)))

(defn- not-found [_]
  (err/->response (err/not-found "No such endpoint.")))

(defn- reitit-handler [config]
  (ring/ring-handler
   (ring/router
    routes
    {:data {:muuntaja m/instance
            :middleware [muuntaja/format-middleware
                         mw/wrap-exception
                         [mw/wrap-context config]
                         mw/wrap-csrf
                         mw/wrap-default-cache]}})
   (ring/create-default-handler
    {:not-found not-found
     :method-not-allowed (fn [_] (err/->response (err/ex 405 "method_not_allowed" "That method isn't allowed here.")))
     :not-acceptable (fn [_] (err/->response (err/ex 406 "not_acceptable" "Unsupported Accept type.")))})))

(defn- wrap-last-resort
  "Catches anything the reitit chain couldn't (e.g. malformed JSON in the
   format middleware itself) and always returns the standard error shape."
  [handler]
  (fn [req]
    (try
      (let [resp (handler req)]
        (if (and (map? (:body resp)) (not (get-in resp [:headers "Content-Type"])))
          (-> resp
              (assoc :body (j/write-value-as-string (:body resp)))
              (assoc-in [:headers "Content-Type"] "application/json"))
          resp))
      (catch Throwable e
        (log/error e "request failed at the outer boundary" (pr-str {:uri (:uri req)}))
        (let [{:keys [status body]} (err/->response e)]
          {:status status
           :headers {"Content-Type" "application/json" "Cache-Control" "no-store"}
           :body (j/write-value-as-string body)})))))

(defn handler [config]
  (-> (reitit-handler config)
      wrap-multipart-params
      wrap-params
      (mw/wrap-ensure-csrf config)   ; issue he_csrf even on throwing 4xx, before wrap-cookies serialises
      wrap-cookies
      wrap-last-resort))
