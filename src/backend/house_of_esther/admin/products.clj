(ns house-of-esther.admin.products
  "A3 products + A5 variant edits. Admin reads see every status."
  (:require [clojure.string :as str]
            [house-of-esther.catalog :as catalog]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.page :as page]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.money :as money]
            [house-of-esther.present :as present]
            [house-of-esther.util :as u]))

(defn- variant-admin [row]
  {:id (:id row) :sku (:sku row) :options (:options row)
   :price (money/kes (:priceAmount row))
   :compareAtPrice (some-> (:compareAtAmount row) money/kes)
   :stock (:stock row)
   :lowStockThreshold (:lowStockThreshold row)
   :imageId (:imageId row)
   :enabled (boolean (:enabled row))
   :stockState (present/stock-state row)})

(defn admin-product [conn id]
  (let [p (db/q1 conn (into [(str "select " catalog/product-cols " from products p where p.id = ?")] [id]))]
    (when-not p (throw (err/not-found "Product not found.")))
    (let [variants (db/q conn ["select id, sku, options, price_amount as \"priceAmount\", compare_at_amount as \"compareAtAmount\",
                                       stock, low_stock_threshold as \"lowStockThreshold\", image_id as \"imageId\", enabled
                                from product_variants where product_id = ? order by created_at" id])
          images   (catalog/images-by-id conn (:imageIds p))]
      {:id (:id p) :slug (:slug p) :name (:name p)
       :category (:category p) :subcategory (:subcategory p)
       :shortDescription (:shortDescription p) :story (:story p) :care (:care p)
       :specs (:specs p)
       :basePrice (money/kes (:basePriceAmount p))
       :compareAtPrice (some-> (:compareAtAmount p) money/kes)
       :costPrice (some-> (:costPriceAmount p) money/kes)
       :vatInclusive (boolean (:vatInclusive p))
       :optionAxes (:optionAxes p)
       :images (mapv #(present/img-detail % (= (:id %) (:primaryImageId p)))
                     (keep #(get images %) (:imageIds p)))
       :primaryImageId (:primaryImageId p)
       :variants (mapv variant-admin variants)
       :sizeGuideCategory (:sizeGuideCategory p)
       :seo (:seo p)
       :status (:status p)
       :publishedAt (some-> (:publishedAt p) .toInstant u/iso)
       :createdAt (some-> (:createdAt p) .toInstant u/iso)
       :updatedAt (some-> (:updatedAt p) .toInstant u/iso)})))

;; --- list --------------------------------------------------------

(defn list-products [{:keys [query-params]}]
  (db/with-tx [conn]
    (let [pg     (page/params query-params)
          status (not-empty (get query-params "status"))
          categ  (not-empty (get query-params "category"))
          qterm  (not-empty (get query-params "q"))
          stock  (not-empty (get query-params "stock"))
          conds  (cond-> ["1=1"]
                   status (conj "p.status = ?")
                   categ  (conj "p.category = ?")
                   qterm  (conj "(p.name ilike ? or p.slug ilike ?)")
                   (= stock "out") (conj "not exists (select 1 from product_variants v where v.product_id = p.id and v.stock > 0)")
                   (= stock "low") (conj "exists (select 1 from product_variants v where v.product_id = p.id and v.stock > 0 and v.stock <= v.low_stock_threshold)")
                   (= stock "in")  (conj "exists (select 1 from product_variants v where v.product_id = p.id and v.stock > v.low_stock_threshold)"))
          args   (cond-> []
                   status (conj status)
                   categ  (conj categ)
                   qterm  (into [(str "%" qterm "%") (str "%" qterm "%")]))
          where  (str/join " and " conds)
          total  (or (db/one-val conn (into [(str "select count(*) from products p where " where)] args)) 0)
          rows   (db/q conn (into [(str "select p.id, p.name, p.slug, p.category, p.status, p.base_price_amount as \"basePriceAmount\",
                                                p.primary_image_id as \"primaryImageId\", p.updated_at as \"updatedAt\",
                                                (select coalesce(sum(stock),0) from product_variants v where v.product_id = p.id) as \"totalStock\",
                                                (select count(*) from product_variants v where v.product_id = p.id) as \"variantCount\"
                                         from products p where " where " order by p.updated_at desc limit ? offset ?")]
                                  (concat args [(:page-size pg) (:offset pg)])))
          imgs   (catalog/images-by-id conn (map :primaryImageId rows))]
      (resp/ok (page/wrap
                (mapv (fn [r]
                        {:id (:id r) :name (:name r) :slug (:slug r) :category (:category r)
                         :status (:status r)
                         :price (money/kes (:basePriceAmount r))
                         :totalStock (:totalStock r)
                         :variantCount (:variantCount r)
                         :primaryThumbUrl (get-in imgs [(:primaryImageId r) :thumbUrl])
                         :updatedAt (some-> (:updatedAt r) .toInstant u/iso)})
                      rows)
                pg total)))))

(defn get-product [{{:keys [id]} :path-params}]
  (db/with-tx [conn] (resp/ok (admin-product conn id))))

(defn preview-product
  "A3 — the product in the exact storefront ProductDetail shape, for a product of
   ANY status, plus an additive `previewStatus` field. The public PDP is untouched."
  [{{:keys [id]} :path-params}]
  (db/with-tx [conn]
    (let [p (catalog/product-by-id conn id)]
      (when-not p (throw (err/not-found "Product not found.")))
      (resp/ok (assoc (catalog/detail-map conn p) :previewStatus (:status p))))))

;; --- create / update ------------------------------------------

(def ^:private Money v/Money)

(def ^:private VariantIn
  "A brand-new variant (POST, or PATCH with no :id)."
  [:map
   [:options v/OptionMap]
   [:sku v/NonBlank]
   [:price Money]
   [:compareAtPrice {:optional true} [:maybe Money]]
   [:stock [:int {:min 0}]]
   [:lowStockThreshold {:optional true} [:int {:min 0}]]
   [:imageId {:optional true} [:maybe :string]]
   [:enabled {:optional true} :boolean]])

(def ^:private VariantUpsert
  "A variant inside a PATCH body: with :id it edits an existing variant,
   without :id it must satisfy VariantIn and is added."
  [:map
   [:id {:optional true} :string]
   [:options {:optional true} v/OptionMap]
   [:sku {:optional true} v/NonBlank]
   [:price {:optional true} Money]
   [:compareAtPrice {:optional true} [:maybe Money]]
   [:stock {:optional true} [:int {:min 0}]]
   [:lowStockThreshold {:optional true} [:int {:min 0}]]
   [:imageId {:optional true} [:maybe :string]]
   [:enabled {:optional true} :boolean]])

(def ^:private ProductIn
  [:map
   [:name v/NonBlank] [:slug v/NonBlank] [:category v/NonBlank]
   [:subcategory {:optional true} [:maybe :string]]
   [:shortDescription {:optional true} [:maybe :string]]
   [:story {:optional true} [:maybe :string]]
   [:care {:optional true} [:maybe :string]]
   [:specs {:optional true} [:vector [:map [:label :string] [:value :string]]]]
   [:basePrice Money]
   [:compareAtPrice {:optional true} [:maybe Money]]
   [:costPrice {:optional true} [:maybe Money]]
   [:vatInclusive {:optional true} :boolean]
   [:optionAxes {:optional true} [:vector [:map [:name :string] [:values [:vector :string]]]]]
   [:variants [:vector VariantIn]]
   [:imageIds {:optional true} [:vector :string]]
   [:primaryImageId {:optional true} [:maybe :string]]
   [:sizeGuideCategory {:optional true} [:maybe :string]]
   [:seo {:optional true} [:maybe [:map]]]
   [:status {:optional true} [:enum "draft" "published" "archived"]]])

(defn- amt [m] (when m (money/amount m)))

(defn create-product [{:keys [body-params]}]
  (let [in (v/validate! ProductIn body-params)]
    (db/with-tx [conn]
      (when (db/q1 conn ["select 1 from products where slug = ?" (:slug in)])
        (throw (err/validation "That slug is already taken."
                               [{:field "slug" :message "must be unique"}])))
      (doseq [vv (:variants in)]
        (when (db/q1 conn ["select 1 from product_variants where sku = ?" (:sku vv)])
          (throw (err/validation "A variant SKU is already in use."
                                 [{:field "sku" :message (str (:sku vv) " already exists")}]))))
      (let [id  (u/prefixed-id "prod")
            pub (= "published" (:status in))]
        (db/exec! conn ["insert into products (id, slug, name, category, subcategory, short_description, story, care, specs,
                                               base_price_amount, compare_at_amount, cost_price_amount, vat_inclusive,
                                               option_axes, image_ids, primary_image_id, size_guide_category, seo, status, published_at)
                         values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
                        id (:slug in) (:name in) (:category in) (:subcategory in)
                        (:shortDescription in) (:story in) (:care in) (vec (or (:specs in) []))
                        (amt (:basePrice in)) (amt (:compareAtPrice in)) (amt (:costPrice in))
                        (boolean (:vatInclusive in)) (vec (or (:optionAxes in) []))
                        (vec (or (:imageIds in) [])) (:primaryImageId in) (:sizeGuideCategory in)
                        (or (:seo in) {}) (or (:status in) "draft")
                        (when pub (java.sql.Timestamp. (System/currentTimeMillis)))])
        (doseq [vv (:variants in)]
          (db/exec! conn ["insert into product_variants (id, product_id, sku, options, price_amount, compare_at_amount, stock, low_stock_threshold, image_id, enabled)
                           values (?,?,?,?,?,?,?,?,?,?)"
                          (u/prefixed-id "var") id (:sku vv) (v/normalize-options (:options vv))
                          (amt (:price vv)) (amt (:compareAtPrice vv))
                          (:stock vv) (or (:lowStockThreshold vv) 2)
                          (:imageId vv) (if (contains? vv :enabled) (:enabled vv) true)]))
        (resp/created (admin-product conn id))))))

(defn- upsert-variant!
  "One entry of a PATCH `variants` array. With :id -> edit an existing variant
   (never touches stock — use inventory adjustments). Without :id -> add a new
   variant (must satisfy VariantIn)."
  [conn product-id vv]
  (if-let [vid (:id vv)]
    (do
      (when-not (db/q1 conn ["select 1 from product_variants where id = ? and product_id = ?" vid product-id])
        (throw (err/not-found (str "Variant " vid " not found on this product."))))
      (when (and (:sku vv) (db/q1 conn ["select 1 from product_variants where sku = ? and id <> ?" (:sku vv) vid]))
        (throw (err/validation "That SKU is already in use." [{:field "sku" :message (str (:sku vv) " already exists")}])))
      (when (contains? vv :price) (db/exec! conn ["update product_variants set price_amount = ? where id = ?" (amt (:price vv)) vid]))
      (when (contains? vv :compareAtPrice) (db/exec! conn ["update product_variants set compare_at_amount = ? where id = ?" (amt (:compareAtPrice vv)) vid]))
      (when (contains? vv :options) (db/exec! conn ["update product_variants set options = ? where id = ?" (v/normalize-options (:options vv)) vid]))
      (doseq [[k col] {:sku "sku" :lowStockThreshold "low_stock_threshold" :imageId "image_id"}]
        (when (contains? vv k) (db/exec! conn [(str "update product_variants set " col " = ? where id = ?") (get vv k) vid])))
      (when (contains? vv :enabled) (db/exec! conn ["update product_variants set enabled = ? where id = ?" (boolean (:enabled vv)) vid])))
    (let [nv (v/validate! VariantIn (dissoc vv :id))]
      (when (db/q1 conn ["select 1 from product_variants where sku = ?" (:sku nv)])
        (throw (err/validation "A variant SKU is already in use." [{:field "sku" :message (str (:sku nv) " already exists")}])))
      (db/exec! conn ["insert into product_variants (id, product_id, sku, options, price_amount, compare_at_amount, stock, low_stock_threshold, image_id, enabled)
                       values (?,?,?,?,?,?,?,?,?,?)"
                      (u/prefixed-id "var") product-id (:sku nv) (v/normalize-options (:options nv))
                      (amt (:price nv)) (amt (:compareAtPrice nv))
                      (:stock nv) (or (:lowStockThreshold nv) 2)
                      (:imageId nv) (if (contains? nv :enabled) (:enabled nv) true)]))))

(def ^:private ProductPatch
  [:map
   [:name {:optional true} v/NonBlank] [:slug {:optional true} v/NonBlank]
   [:category {:optional true} v/NonBlank] [:subcategory {:optional true} [:maybe :string]]
   [:shortDescription {:optional true} [:maybe :string]] [:story {:optional true} [:maybe :string]]
   [:care {:optional true} [:maybe :string]]
   [:specs {:optional true} [:vector [:map [:label :string] [:value :string]]]]
   [:basePrice {:optional true} Money] [:compareAtPrice {:optional true} [:maybe Money]]
   [:costPrice {:optional true} [:maybe Money]] [:vatInclusive {:optional true} :boolean]
   [:optionAxes {:optional true} [:vector [:map [:name :string] [:values [:vector :string]]]]]
   [:imageIds {:optional true} [:vector :string]] [:primaryImageId {:optional true} [:maybe :string]]
   [:sizeGuideCategory {:optional true} [:maybe :string]] [:seo {:optional true} [:maybe [:map]]]
   [:variants {:optional true} [:vector VariantUpsert]]
   [:status {:optional true} [:enum "draft" "published" "archived"]]])

(defn update-product [{:keys [body-params] {:keys [id]} :path-params}]
  (let [in (v/validate! ProductPatch body-params)]
    (db/with-tx [conn]
      (when-not (db/q1 conn ["select 1 from products where id = ?" id])
        (throw (err/not-found "Product not found.")))
      (when (and (:slug in) (db/q1 conn ["select 1 from products where slug = ? and id <> ?" (:slug in) id]))
        (throw (err/validation "That slug is already taken." [{:field "slug" :message "must be unique"}])))
      (doseq [[k col] {:name "name" :slug "slug" :category "category" :subcategory "subcategory"
                       :shortDescription "short_description" :story "story" :care "care"
                       :sizeGuideCategory "size_guide_category"}]
        (when (contains? in k)
          (db/exec! conn [(str "update products set " col " = ? where id = ?") (get in k) id])))
      (doseq [[k col] {:specs "specs" :optionAxes "option_axes" :imageIds "image_ids" :seo "seo"}]
        (when (contains? in k)
          (db/exec! conn [(str "update products set " col " = ? where id = ?") (get in k) id])))
      (when (contains? in :basePrice)   (db/exec! conn ["update products set base_price_amount = ? where id = ?" (amt (:basePrice in)) id]))
      (when (contains? in :compareAtPrice) (db/exec! conn ["update products set compare_at_amount = ? where id = ?" (amt (:compareAtPrice in)) id]))
      (when (contains? in :costPrice)   (db/exec! conn ["update products set cost_price_amount = ? where id = ?" (amt (:costPrice in)) id]))
      (when (contains? in :vatInclusive) (db/exec! conn ["update products set vat_inclusive = ? where id = ?" (boolean (:vatInclusive in)) id]))
      (when (contains? in :primaryImageId) (db/exec! conn ["update products set primary_image_id = ? where id = ?" (:primaryImageId in) id]))
      (when (contains? in :status)
        (db/exec! conn ["update products set status = ?,
                          published_at = case when ? = 'published' and published_at is null then now() else published_at end
                          where id = ?" (:status in) (:status in) id]))
      (doseq [vv (:variants in)]
        (upsert-variant! conn id vv))
      (db/exec! conn ["update products set updated_at = now() where id = ?" id])
      (resp/ok (admin-product conn id)))))

(defn delete-product [{{:keys [id]} :path-params}]
  (db/with-tx [conn]
    (when-not (db/q1 conn ["select 1 from products where id = ?" id])
      (throw (err/not-found "Product not found.")))
    (db/exec! conn ["update products set status = 'archived', updated_at = now() where id = ?" id])
    (resp/ok (admin-product conn id))))

;; --- A5 variant patch --------------------------------------

(def ^:private VariantPatch
  [:map
   [:price {:optional true} Money] [:compareAtPrice {:optional true} [:maybe Money]]
   [:sku {:optional true} v/NonBlank] [:lowStockThreshold {:optional true} [:int {:min 0}]]
   [:enabled {:optional true} :boolean] [:imageId {:optional true} [:maybe :string]]])

(defn patch-variant [{:keys [body-params] {:keys [id variantId]} :path-params}]
  (let [in (v/validate! VariantPatch body-params)]
    (db/with-tx [conn]
      (let [row (db/q1 conn ["select id from product_variants where id = ? and product_id = ?" variantId id])]
        (when-not row (throw (err/not-found "Variant not found.")))
        (when (and (:sku in) (db/q1 conn ["select 1 from product_variants where sku = ? and id <> ?" (:sku in) variantId]))
          (throw (err/validation "That SKU is already in use." [{:field "sku" :message "must be unique"}])))
        (when (contains? in :price) (db/exec! conn ["update product_variants set price_amount = ? where id = ?" (amt (:price in)) variantId]))
        (when (contains? in :compareAtPrice) (db/exec! conn ["update product_variants set compare_at_amount = ? where id = ?" (amt (:compareAtPrice in)) variantId]))
        (doseq [[k col] {:sku "sku" :lowStockThreshold "low_stock_threshold" :imageId "image_id"}]
          (when (contains? in k) (db/exec! conn [(str "update product_variants set " col " = ? where id = ?") (get in k) variantId])))
        (when (contains? in :enabled) (db/exec! conn ["update product_variants set enabled = ? where id = ?" (boolean (:enabled in)) variantId]))
        (db/exec! conn ["update products set updated_at = now() where id = ?" id])
        (resp/ok (variant-admin (db/q1 conn ["select id, sku, options, price_amount as \"priceAmount\", compare_at_amount as \"compareAtAmount\",
                                                     stock, low_stock_threshold as \"lowStockThreshold\", image_id as \"imageId\", enabled
                                              from product_variants where id = ?" variantId])))))))

(def routes
  [["/products" {:get list-products :post create-product}]
   ["/products/:id" {:get get-product :patch update-product :delete delete-product}]
   ["/products/:id/preview" {:get preview-product}]
   ["/products/:id/variants/:variantId" {:patch patch-variant}]])
