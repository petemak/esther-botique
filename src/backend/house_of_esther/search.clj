(ns house-of-esther.search
  "D3 — search suggestions."
  (:require [clojure.string :as str]
            [house-of-esther.catalog :as catalog]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.money :as money]))

(defn suggestions [{:keys [query-params]}]
  (let [term (some-> (get query-params "q") str/trim)]
    (when (or (nil? term) (< (count term) 2))
      (throw (err/validation "Type at least two characters."
                             [{:field "q" :message "minimum 2 characters"}])))
    (db/with-tx [conn]
      (let [like (str "%" term "%")
            products (db/q conn ["select slug, name, base_price_amount as \"priceAmount\", primary_image_id as \"primaryImageId\"
                                  from products where status = 'published' and name ilike ?
                                  order by published_at desc nulls last limit 6" like])
            imgs (catalog/images-by-id conn (map :primaryImageId products))
            cats (db/q conn ["select slug, label from categories where label ilike ? and parent_slug is null limit 4" like])
            terms (db/q conn ["select distinct name from products where status='published' and name ilike ? limit 6" like])]
        (resp/ok
         {:terms (mapv :name terms)
          :products (mapv (fn [p]
                            (let [img (get imgs (:primaryImageId p))]
                              {:slug (:slug p) :name (:name p)
                               :price (money/kes (:priceAmount p))
                               :thumbUrl (:thumbUrl img) :alt (:alt img)}))
                          products)
          :categories (mapv #(hash-map :slug (:slug %) :label (:label %)) cats)}
         resp/cache-catalog)))))

(def routes
  [["/search/suggestions" {:get suggestions}]])
