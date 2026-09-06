(ns house-of-esther.http.response
  "Response builders. Bodies are plain Clojure maps; muuntaja encodes JSON.")

(def cache-catalog
  "Catalog / content reads: CDN-cacheable, tolerates slightly stale."
  {"Cache-Control" "public, max-age=120, stale-while-revalidate=600"})

(def cache-quote
  {"Cache-Control" "private, max-age=30"})

(def no-store
  {"Cache-Control" "no-store"})

(defn ok
  ([body] (ok body no-store))
  ([body headers] {:status 200 :headers headers :body body}))

(defn created
  ([body] (created body no-store))
  ([body headers] {:status 201 :headers headers :body body}))

(defn accepted
  ([body] {:status 202 :headers no-store :body body}))

(def no-content {:status 204 :headers no-store})

(defn with-cookie [resp name value opts]
  (assoc-in resp [:cookies name] (merge {:value value} opts)))
