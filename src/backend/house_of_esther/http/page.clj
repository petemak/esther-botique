(ns house-of-esther.http.page
  "Pagination: query `page` (1-based, default 1) and `pageSize` (default 24, max 60)."
  (:require [house-of-esther.util :as u]))

(defn params
  ([q] (params q {:default 24 :max 60}))
  ([q {:keys [default max]}]
   (let [page (clojure.core/max 1 (or (u/parse-long* (get q "page")) 1))
         size (-> (or (u/parse-long* (get q "pageSize")) default)
                  (clojure.core/max 1)
                  (clojure.core/min max))]
     {:page page :page-size size :offset (* (dec page) size)})))

(defn wrap
  "List envelope: { items, page, pageSize, total, totalPages }."
  [items {:keys [page page-size]} total]
  {:items items
   :page page
   :pageSize page-size
   :total total
   :totalPages (long (Math/ceil (/ (double (clojure.core/max 0 total))
                                   (double page-size))))})
