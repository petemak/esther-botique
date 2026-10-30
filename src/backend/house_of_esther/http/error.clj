(ns house-of-esther.http.error
  "One error shape for every non-2xx response:
     { \"error\": { \"code\": ..., \"message\": ... } }
   plus an optional error.details array for validation errors.")

(defn ex
  "Build an api-error exception. status + code + brand-voiced message."
  ([status code message] (ex status code message nil))
  ([status code message details]
   (ex-info message
            (cond-> {:type ::api-error :status status :code code :message message}
              (seq details) (assoc :details (vec details))))))

(defn api-error? [e]
  (= ::api-error (:type (ex-data e))))

;; convenience constructors -------------------------------------------------

(defn validation
  ([message] (validation message nil))
  ([message details] (ex 422 "validation_error" message details)))

(defn unauthorized
  ([] (unauthorized "Please sign in to continue."))
  ([m] (ex 401 "unauthorized" m)))

(defn forbidden
  ([] (forbidden "You don't have access to this."))
  ([m] (ex 403 "forbidden" m)))

(defn not-found
  ([] (not-found "We couldn't find that."))
  ([m] (ex 404 "not_found" m)))

(defn conflict
  ([m] (conflict "conflict" m nil))
  ([code m details] (ex 409 code m details)))

(defn rate-limited
  ([] (rate-limited "You're going a little fast. Try again shortly."))
  ([m] (ex 429 "rate_limited" m)))

(defn payment-method-not-allowed
  "422 for a payment method this deployment / delivery zone does not accept."
  [m]
  (ex 422 "payment_method_not_allowed" m [{:field "paymentMethod" :message "not allowed"}]))

(defn payment-failed [m] (ex 402 "payment_failed" m))

(defn service-unavailable [m] (ex 503 "service_unavailable" m))

(defn internal [m] (ex 500 "internal_error" m))

(defn ->response
  "Turn any Throwable into the standard error response map."
  [e]
  (let [d (ex-data e)]
    (if (api-error? e)
      {:status (:status d)
       :body   (cond-> {:error (cond-> {:code (:code d) :message (:message d)}
                                 (seq (:details d)) (assoc :details (:details d)))}
                 ;; contract D12: the 409 price_changed body also carries the corrected preview
                 (:order d) (assoc :order (:order d)))}
      {:status 500
       :body   {:error {:code "internal_error"
                        :message "Something went wrong on our side. Please try again."}}})))
