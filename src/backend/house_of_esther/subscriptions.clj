(ns house-of-esther.subscriptions
  "D24 subscribe (newsletter + back-in-stock), D25 confirm / unsubscribe."
  (:require [clojure.string :as str]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.notify :as notify]
            [house-of-esther.util :as u]))

(def ^:private SubReq
  [:map
   [:email v/Email]
   [:source [:enum "footer" "home" "checkout" "product_back_in_stock"]]
   [:productId {:optional true} [:maybe :string]]
   [:variantId {:optional true} [:maybe :string]]])

(defn subscribe [{:keys [body-params]}]
  (let [{:keys [email source productId variantId]} (v/validate! SubReq body-params)
        email (str/lower-case (str/trim email))]
    (db/with-tx [conn]
      (if variantId
        ;; back-in-stock request
        (let [variant (db/q1 conn ["select id, stock, enabled from product_variants where id = ?" variantId])]
          (when-not variant (throw (err/not-found "That option doesn't exist.")))
          (if (and (:enabled variant) (pos? (long (:stock variant))))
            (resp/ok {:status "confirmed"
                      :message "Good news — that piece is in stock right now."})
            (let [existing (db/q1 conn ["select id, status from subscribers where email = ? and variant_id = ?" email variantId])]
              (when-not existing
                (let [tok (u/token)]
                  (db/exec! conn ["insert into subscribers (id, email, status, source, product_id, variant_id, new_arrivals, back_in_stock, confirm_token, unsub_token)
                                   values (?,?,?,?,?,?,?,?,?,?)"
                                  (u/prefixed-id "sub") email "pending" source productId variantId false true tok (u/token)])
                  (notify/enqueue! conn :subscribe-confirm {:email email :token tok})))
              (resp/accepted {:status "pending_confirmation"
                              :message "Almost there — tap the link in the email to confirm."}))))
        ;; newsletter
        (let [existing (db/q1 conn ["select id, status from subscribers where email = ? and variant_id is null" email])]
          (cond
            (and existing (= "confirmed" (:status existing)))
            (resp/ok {:status "confirmed"})

            existing
            (resp/accepted {:status "pending_confirmation"
                            :message "Almost there — tap the link in the email to confirm."})

            :else
            (let [tok (u/token)]
              (db/exec! conn ["insert into subscribers (id, email, status, source, new_arrivals, journal, confirm_token, unsub_token)
                               values (?,?,?,?,?,?,?,?)"
                              (u/prefixed-id "sub") email "pending" source true false tok (u/token)])
              (notify/enqueue! conn :subscribe-confirm {:email email :token tok})
              (resp/accepted {:status "pending_confirmation"
                              :message "Almost there — tap the link in the email to confirm."}))))))))

(def ^:private TokenReq [:map [:token v/NonBlank]])

(defn confirm [{:keys [body-params]}]
  (let [{:keys [token]} (v/validate! TokenReq body-params)]
    (db/with-tx [conn]
      (let [row (db/q1 conn ["select id from subscribers where confirm_token = ?" token])]
        (when-not row (throw (err/ex 422 "token_invalid" "That confirmation link isn't valid.")))
        (db/exec! conn ["update subscribers set status = 'confirmed', confirmed_at = now(), confirm_token = null where id = ?" (:id row)])
        (resp/ok {:status "confirmed"})))))

(defn unsubscribe [{:keys [body-params]}]
  (let [{:keys [token]} (v/validate! TokenReq body-params)]
    (db/with-tx [conn]
      (let [row (db/q1 conn ["select id from subscribers where unsub_token = ?" token])]
        (when-not row (throw (err/ex 422 "token_invalid" "That link isn't valid.")))
        (db/exec! conn ["update subscribers set status = 'unsubscribed' where id = ?" (:id row)])
        (resp/ok {:status "unsubscribed"})))))

(def routes
  [["/subscriptions" {:post subscribe}]
   ["/subscriptions/confirm" {:post confirm}]
   ["/subscriptions/unsubscribe" {:post unsubscribe}]])
