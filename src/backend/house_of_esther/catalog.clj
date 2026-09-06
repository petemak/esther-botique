(ns house-of-esther.catalog
  "Catalog vertical slice: products (list/detail/availability/related),
   categories, collections. Storefront reads only see published products."
  (:require [clojure.string :as str]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.page :as page]
            [house-of-esther.http.response :as resp]
            [house-of-esther.present :as present]
            [house-of-esther.util :as u]))

;; --- image resolution ---------------------------------------------------

(defn images-by-id
  "Return {id image-row} for the given ids."
  ([ids] (images-by-id (db/ds) ids))
  ([conn ids]
   (let [ids (distinct (remove nil? ids))]
     (if (empty? ids)
       {}
       (->> (db/q conn (into [(format "select id, alt, thumb_url as \"thumbUrl\", full_url as \"fullUrl\", width, height from images where id in (%s)"
                                      (str/join "," (repeat (count ids) "?")))]
                             ids))
            (map (juxt :id identity))
            (into {}))))))

(defn- variants-for
  ([product-ids] (variants-for (db/ds) product-ids))
  ([conn product-ids]
   (if (empty? product-ids)
     []
     (db/q conn (into [(format "select id, product_id as \"productId\", sku, options,
                                       price_amount as \"priceAmount\", compare_at_amount as \"compareAtAmount\",
                                       stock, low_stock_threshold as \"lowStockThreshold\",
                                       image_id as \"imageId\", enabled
                                from product_variants where product_id in (%s)
                                order by created_at"
                               (str/join "," (repeat (count product-ids) "?")))]
                      product-ids)))))

(defn- ratings-for
  "Return {product-id {:avg :cnt}} across approved reviews."
  [conn product-ids]
  (if (empty? product-ids)
    {}
    (->> (db/q conn (into [(format "select product_id as \"productId\", avg(rating)::float as avg, count(*) as cnt
                                    from reviews where status = 'approved' and product_id in (%s)
                                    group by product_id"
                                   (str/join "," (repeat (count product-ids) "?")))]
                          product-ids))
         (map (juxt :productId #(hash-map :avg (:avg %) :cnt (:cnt %))))
         (into {}))))

(def product-cols
  "Column list for the products table aliased as `p`."
  "p.id, p.slug, p.name, p.category, p.subcategory, p.short_description as \"shortDescription\",
   p.story, p.care, p.specs, p.base_price_amount as \"basePriceAmount\",
   p.compare_at_amount as \"compareAtAmount\", p.cost_price_amount as \"costPriceAmount\",
   p.currency, p.vat_inclusive as \"vatInclusive\", p.option_axes as \"optionAxes\",
   p.image_ids as \"imageIds\", p.primary_image_id as \"primaryImageId\",
   p.size_guide_category as \"sizeGuideCategory\", p.seo, p.status,
   p.published_at as \"publishedAt\", p.created_at as \"createdAt\", p.updated_at as \"updatedAt\"")

(defn hydrate-cards [conn products]
  (let [ids      (map :id products)
        images   (images-by-id conn (mapcat :imageIds products))
        vmap     (group-by :productId (variants-for conn ids))
        rmap     (ratings-for conn ids)]
    (mapv (fn [p]
            (present/product-card p {:images images
                                     :variants (vmap (:id p))
                                     :rating (rmap (:id p))}))
          products)))

;; --- filter -> SQL ---------------------------------------------------

(defn- collection-product-ids [conn slug]
  (when-let [c (db/q1 conn ["select rule from collections where slug = ?" slug])]
    (let [{:keys [type productIds days]} (:rule c)]
      (case type
        "manual" {:ids (vec productIds)}
        "auto_new_arrivals" {:since (- (System/currentTimeMillis) (* (or days 30) 86400000))}
        "auto_sale" {:sale true}
        {:ids []}))))

(defn build-list-query
  "Pure: turn a params map into [sql & args] plus a count query."
  [{:keys [category subcategory q color size minPrice maxPrice onSale inStock sort
           collection-ids collection-since collection-sale]}
   {:keys [offset page-size]}]
  (let [manual-empty? (and (some? collection-ids) (empty? collection-ids))
        conds (cond-> ["p.status = 'published'"]
                category    (conj "p.category = ?")
                subcategory (conj "p.subcategory = ?")
                (seq q)     (conj "(p.name ilike ? or p.short_description ilike ?)")
                minPrice    (conj "p.base_price_amount >= ?")
                maxPrice    (conj "p.base_price_amount <= ?")
                onSale      (conj "p.compare_at_amount is not null and p.compare_at_amount > p.base_price_amount")
                manual-empty?         (conj "1 = 0")
                (seq collection-ids)  (conj (format "p.id in (%s)"
                                                    (str/join "," (repeat (count collection-ids) "?"))))
                collection-since (conj "p.published_at >= to_timestamp(? / 1000.0)")
                collection-sale  (conj "p.compare_at_amount is not null and p.compare_at_amount > p.base_price_amount")
                inStock     (conj "exists (select 1 from product_variants v where v.product_id = p.id and v.enabled and v.stock > 0)")
                (seq color) (conj (format "exists (select 1 from product_variants v where v.product_id = p.id and lower(v.options->>'Colour') in (%s))"
                                          (str/join "," (repeat (count color) "?"))))
                (seq size)  (conj (format "exists (select 1 from product_variants v where v.product_id = p.id and v.options->>'Size' in (%s))"
                                          (str/join "," (repeat (count size) "?")))))
        args  (cond-> []
                category    (conj category)
                subcategory (conj subcategory)
                (seq q)     (into [(str "%" q "%") (str "%" q "%")])
                minPrice    (conj minPrice)
                maxPrice    (conj maxPrice)
                (seq collection-ids)  (into collection-ids)
                collection-since (conj collection-since)
                (seq color) (into (map str/lower-case color))
                (seq size)  (into size))
        where (str/join " and " conds)
        order (case sort
                "price_asc"  "p.base_price_amount asc"
                "price_desc" "p.base_price_amount desc"
                "rating"     "(select coalesce(avg(rating),0) from reviews r where r.product_id = p.id and r.status='approved') desc"
                ("relevance" "newest" nil) "p.published_at desc nulls last, p.created_at desc"
                "p.published_at desc nulls last")]
    {:rows  (into [(format "select %s from products p where %s order by %s limit ? offset ?"
                           product-cols where order)]
                  (concat args [page-size offset]))
     :count (into [(format "select count(*) from products p where %s" where)] args)}))

;; --- handlers ---------------------------------------------------------

(defn- q->params [q]
  (let [multi (fn [k] (let [v (get q k)] (cond (nil? v) nil (string? v) [v] :else (vec v))))]
    {:category   (not-empty (get q "category"))
     :subcategory (not-empty (get q "subcategory"))
     :collection (not-empty (get q "collection"))
     :q          (not-empty (get q "q"))
     :color      (multi "color")
     :size       (multi "size")
     :minPrice   (u/parse-long* (get q "minPrice"))
     :maxPrice   (u/parse-long* (get q "maxPrice"))
     :onSale     (u/parse-bool (get q "onSale"))
     :inStock    (u/parse-bool (get q "inStock"))
     :sort       (or (not-empty (get q "sort")) "newest")}))

(defn- facets [conn]
  ;; lightweight facets over the published catalogue (not re-filtered per query
  ;; for this milestone — documented simplification)
  (let [cats (db/q conn ["select category as value, category as label, count(*) as count
                          from products where status='published' group by category order by count desc"])
        subs (db/q conn ["select subcategory as value, subcategory as label, count(*) as count
                          from products where status='published' and subcategory is not null
                          group by subcategory order by count desc"])
        pr   (db/q1 conn ["select min(base_price_amount) as min, max(base_price_amount) as max
                           from products where status='published'"])]
    {:categories cats
     :subcategories subs
     :colors []
     :sizes []
     :priceRange {:min (or (:min pr) 0) :max (or (:max pr) 0) :currency "KES"}}))

(defn list-products [{:keys [query-params]}]
  (db/with-tx [conn]
    (let [p       (q->params query-params)
          pg      (page/params query-params)
          coll    (when (:collection p) (collection-product-ids conn (:collection p)))
          qspec   (build-list-query
                   (merge p {:collection-ids   (:ids coll)
                             :collection-since (:since coll)
                             :collection-sale  (:sale coll)})
                   pg)
          rows    (db/q conn (:rows qspec))
          total   (or (db/one-val conn (:count qspec)) 0)
          items   (hydrate-cards conn rows)
          heading (when (:category p)
                    (when-let [c (db/q1 conn ["select label, description from categories where slug = ?" (:category p)])]
                      {:title (:label c) :description (:description c)}))]
      (resp/ok
       (merge (page/wrap items pg total)
              {:appliedFilters (into {} (remove (comp nil? val))
                                     (select-keys p [:category :subcategory :color :size
                                                     :minPrice :maxPrice :onSale :inStock]))
               :facets (facets conn)
               :query {:term (:q p) :didYouMean nil}
               :heading heading})
       resp/cache-catalog))))

(defn get-product [{{:keys [slug]} :path-params}]
  (db/with-tx [conn]
    (let [p (db/q1 conn (into [(str "select " product-cols " from products p where slug = ? and status = 'published'")] [slug]))]
      (when-not p (throw (err/not-found "That piece isn't available right now.")))
      (let [variants (variants-for conn [(:id p)])
            images   (images-by-id conn (:imageIds p))
            rating   (get (ratings-for conn [(:id p)]) (:id p))
            cat      (db/q1 conn ["select label from categories where slug = ?" (:category p)])
            subcat   (db/q1 conn ["select label from categories where slug = ?" (:subcategory p)])]
        (resp/ok (present/product-detail p {:images images :variants variants :rating rating
                                            :cat-label (:label cat) :subcat-label (:label subcat)})
                 resp/cache-catalog)))))

(defn availability [{{:keys [slug]} :path-params}]
  (db/with-tx [conn]
    (let [p (db/q1 conn ["select id from products where slug = ? and status = 'published'" slug])]
      (when-not p (throw (err/not-found "That piece isn't available right now.")))
      (resp/ok {:variants (mapv present/variant-availability (variants-for conn [(:id p)]))}))))

(defn related [{{:keys [slug]} :path-params :keys [query-params]}]
  (db/with-tx [conn]
    (let [limit (min 12 (max 1 (or (u/parse-long* (get query-params "limit")) 4)))
          p (db/q1 conn ["select id, category from products where slug = ? and status = 'published'" slug])]
      (when-not p (throw (err/not-found "That piece isn't available right now.")))
      (let [rows (db/q conn [(str "select " product-cols
                                  " from products p where category = ? and id <> ? and status = 'published'
                                    order by published_at desc nulls last limit ?")
                             (:category p) (:id p) limit])]
        (resp/ok {:items (hydrate-cards conn rows)} resp/cache-catalog)))))

;; --- categories & collections -------------------------------------

(defn list-categories [_]
  (db/with-tx [conn]
    (let [cats (db/q conn ["select slug, label, description, image_id as \"imageId\", parent_slug as \"parentSlug\", sort_order as \"sortOrder\"
                            from categories order by sort_order, label"])
          imgs (images-by-id conn (map :imageId cats))
          top  (remove :parentSlug cats)
          kids (group-by :parentSlug cats)]
      (resp/ok
       {:items (mapv (fn [c]
                       {:slug (:slug c) :label (:label c) :description (:description c)
                        :image (present/img-thumb (get imgs (:imageId c)))
                        :subcategories (mapv #(hash-map :slug (:slug %) :label (:label %))
                                             (get kids (:slug c)))})
                     top)}
       resp/cache-catalog))))

(defn get-collection [{{:keys [slug]} :path-params}]
  (db/with-tx [conn]
    (let [c (db/q1 conn ["select slug, title, description, hero_image_id as \"heroImageId\" from collections where slug = ?" slug])]
      (when-not c (throw (err/not-found "We couldn't find that edit.")))
      (let [img (get (images-by-id conn [(:heroImageId c)]) (:heroImageId c))]
        (resp/ok {:slug (:slug c) :title (:title c) :description (:description c)
                  :heroImage (present/img-full img)}
                 resp/cache-catalog)))))

(def routes
  [["/products"        {:get list-products}]
   ["/products/:slug"  {:get get-product}]
   ["/products/:slug/availability" {:get availability}]
   ["/products/:slug/related"      {:get related}]
   ["/categories"      {:get list-categories}]
   ["/collections/:slug" {:get get-collection}]])
