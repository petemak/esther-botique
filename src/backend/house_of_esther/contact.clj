(ns house-of-esther.contact
  "D26 — contact form. Honeypot `website`: non-empty -> silent 200, no ticket."
  (:require [house-of-esther.db :as db]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.notify :as notify]
            [house-of-esther.util :as u]))

(def ^:private ContactReq
  [:map
   [:name v/NonBlank]
   [:email v/Email]
   [:phone {:optional true} [:maybe :string]]
   [:topic [:enum "order_issue" "return" "product_question" "wholesale_press" "other"]]
   [:orderNumber {:optional true} [:maybe :string]]
   [:message [:string {:min 1 :max 5000}]]
   [:website {:optional true} [:maybe :string]]])

(defn- reference []
  (format "MSG-%s-%04d" (subs (u/iso-date) 0 4) (rand-int 10000)))

(defn submit [{:keys [body-params]}]
  ;; honeypot check happens before validation so bots get a clean 200
  (if (not (u/blank? (:website body-params)))
    (resp/created {:reference (reference)
                   :message "Got it. We reply within one business day."})
    (let [{:keys [name email phone topic orderNumber message]} (v/validate! ContactReq body-params)
          ref (reference)]
      (db/with-tx [conn]
        (db/exec! conn ["insert into contact_messages (id, reference, name, email, phone, topic, order_number, message)
                         values (?,?,?,?,?,?,?,?)"
                        (u/prefixed-id "msg") ref name email phone topic orderNumber message])
        (notify/enqueue! conn :contact-received {:reference ref :topic topic :email email}))
      (resp/created {:reference ref
                     :message "Got it. We reply within one business day."}))))

(def routes
  [["/contact" {:post submit}]])
