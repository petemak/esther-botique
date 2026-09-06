(ns house-of-esther.http.validate
  "Boundary validation with malli. Every external input is validated here,
   before it reaches business logic (engineering-standards, non-negotiable)."
  (:require [clojure.string :as str]
            [malli.core :as m]
            [malli.error :as me]
            [house-of-esther.http.error :as err]))

(defn- field-path [path]
  (let [p (str/join "." (map #(if (keyword? %) (name %) (str %)) path))]
    (if (str/blank? p) "_" p)))

(defn flatten-errors
  "Turn malli's (arbitrarily nested) humanized explanation into a flat
   [{:field \"a.b.0\" :message \"...\"}] list where :message is ALWAYS a string."
  ([node] (flatten-errors node []))
  ([node path]
   (cond
     (string? node)
     [{:field (field-path path) :message node}]

     (and (sequential? node) (every? string? node))
     [{:field (field-path path) :message (str/join "; " node)}]

     (map? node)
     (vec (mapcat (fn [[k v]] (flatten-errors v (conj path k))) node))

     (sequential? node) ;; positional errors for a collection
     (vec (mapcat (fn [i v] (when (some? v) (flatten-errors v (conj path i))))
                  (range) node))

     (nil? node) []

     :else
     [{:field (field-path path) :message (str node)}])))

(defn validate!
  "Validate `value` against `schema`. On failure throw a 422 validation_error
   with error.details [{:field, :message}], :message always a human string."
  [schema value]
  (let [v (or value {})]
    (if (m/validate schema v)
      v
      (let [details (flatten-errors (me/humanize (m/explain schema v)))]
        (throw (err/validation "Please check the highlighted fields."
                               (or (seq details)
                                   [{:field "_" :message "invalid request"}])))))))

(def NonBlank [:string {:min 1}])
(def Email [:re {:error/message "must be a valid email"}
            #"^[^@\s]+@[^@\s]+\.[^@\s]+$"])
(def Phone [:re {:error/message "must be a valid phone number"}
            #"^\+?[0-9]{7,15}$"])
(def PosInt [:int {:min 1}])
(def Money [:map [:amount :int] [:currency [:enum "KES"]]])

;; Option maps (e.g. {"Colour":"Tan","Size":"S"}) arrive from muuntaja with
;; keywordized keys. Accept either, values are strings.
(def OptionMap [:map-of [:or :keyword :string] :string])

(defn normalize-options
  "Coerce an option map to string keys for storage."
  [m]
  (reduce-kv (fn [acc k val] (assoc acc (if (keyword? k) (name k) (str k)) val)) {} (or m {})))
