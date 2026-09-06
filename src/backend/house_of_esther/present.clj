(ns house-of-esther.present
  "Presenters for shapes shared across features: ImageRef, ProductCard,
   ProductDetail, Cart, Order. Pure functions — take resolved rows, return the
   exact JSON maps the API contract specifies."
  (:require [clojure.string :as str]
            [house-of-esther.money :as money]
            [house-of-esther.util :as u]))

;; --- images --------------------------------------------------------------

(defn img-thumb
  "Card / grid image: thumbnail only."
  [img]
  (when img
    {:id (:id img) :alt (:alt img)
     :thumbUrl (:thumbUrl img)
     :width (:width img) :height (:height img)}))

(defn img-full
  "Hero / editorial image: full + thumb, no isPrimary."
  [img]
  (when img
    {:id (:id img) :alt (:alt img)
     :thumbUrl (:thumbUrl img) :fullUrl (:fullUrl img)
     :width (:width img) :height (:height img)}))

(defn img-detail
  "Product gallery image: full + thumb + isPrimary."
  [img primary?]
  (when img
    (assoc (img-full img) :isPrimary (boolean primary?))))

;; --- colours -----------------------------------------------------------

(def ^:private colour-hex
  {"black" "#1A1A1A" "white" "#F4F1EC" "cream" "#EFE7D8" "ivory" "#EFE7D8"
   "tan" "#B98A5E" "brown" "#6B4A2E" "camel" "#C19A6B" "beige" "#D8C6A8"
   "navy" "#1F2A44" "blue" "#3B5B92" "denim" "#4A6079" "sky" "#9DBEDC"
   "olive" "#6B6B47" "khaki" "#8A7F5C" "sage" "#9CA986" "forest" "#2E4030"
   "rust" "#9E4A2E" "terracotta" "#B4623F" "burgundy" "#5E2331" "wine" "#5E2331"
   "grey" "#8A8A8A" "gray" "#8A8A8A" "charcoal" "#3A3A3A" "stone" "#B7AEA0"
   "pink" "#E4B7BE" "blush" "#E6C7C2" "red" "#9E2B2B" "green" "#3F5F45"
   "yellow" "#D8B24A" "mustard" "#C99A2E" "gold" "#C9A24A" "silver" "#C7C7C7"
   "lilac" "#B9A7C9" "purple" "#5B4A78" "orange" "#C9702E" "coral" "#E08A6E"})

(defn colour->hex [name]
  (get colour-hex (some-> name str/lower-case str/trim) "#8A8A8A"))

;; --- stock ------------------------------------------------------------

(defn stock-state
  "in_stock | low_stock | out_of_stock for a single variant row."
  [{:keys [stock lowStockThreshold enabled]}]
  (let [s (long (or stock 0))
        t (long (or lowStockThreshold 2))]
    (cond
      (or (not enabled) (<= s 0)) "out_of_stock"
      (<= s t)                    "low_stock"
      :else                      "in_stock")))

(defn variant-availability
  "Availability sub-shape used by /availability and buy-box re-checks."
  [v]
  (let [state (stock-state v)]
    (cond-> {:id (:id v)
             :inStock (= state "in_stock")
             :stockState state}
      (not= state "in_stock") (assoc :quantityAvailable (max 0 (long (or (:stock v) 0)))))))

;; --- money helpers on rows -------------------------------------------

(defn money* [amount] (when (some? amount) (money/kes amount)))

;; --- product card / detail -----------------------------------------

(defn- axis-values [option-axes axis-name]
  (some (fn [{:keys [name values]}]
          (when (= (str/lower-case (str name)) axis-name) values))
        option-axes))

(defn- product-colours [product]
  (let [axes (:optionAxes product)
        vals (or (axis-values axes "colour") (axis-values axes "color"))]
    (mapv (fn [v] {:name v :hex (colour->hex v)}) vals)))

(defn- rating-shape [{:keys [avg cnt]}]
  {:average (if (and avg (pos? (or cnt 0)))
              (-> (* 1.0 avg) (* 10) Math/round (/ 10.0))
              0)
   :count (long (or cnt 0))})

(defn new? [product]
  (boolean
   (when-let [t (:publishedAt product)]
     (let [inst (.toInstant ^java.sql.Timestamp t)]
       (.isAfter inst (.minusSeconds (u/now) (* 60 60 24 30)))))))

(defn on-sale? [price compare-at]
  (boolean (and compare-at price (> (long compare-at) (long price)))))

(defn product-card
  "ProductCard grid item. `ctx` = {:images {id row} :variants [rows] :rating {:avg :cnt}}."
  [product {:keys [images variants rating]}]
  (let [price      (:basePriceAmount product)
        compare-at (:compareAtAmount product)
        primary    (get images (:primaryImageId product))
        in-stock   (boolean (some #(and (:enabled %) (pos? (long (or (:stock %) 0)))) variants))]
    {:id (:id product)
     :slug (:slug product)
     :name (:name product)
     :category (:category product)
     :subcategory (:subcategory product)
     :price (money/kes price)
     :compareAtPrice (money* compare-at)
     :onSale (on-sale? price compare-at)
     :isNew (new? product)
     :primaryImage (img-thumb primary)
     :colors (product-colours product)
     :rating (rating-shape rating)
     :inStock in-stock}))

(defn- variant-detail [v]
  (let [state (stock-state v)]
    (cond-> {:id (:id v)
             :sku (:sku v)
             :options (:options v)
             :price (money/kes (:priceAmount v))
             :compareAtPrice (money* (:compareAtAmount v))
             :inStock (= state "in_stock")
             :stockState state
             :imageId (:imageId v)}
      (not= state "in_stock")
      (assoc :quantityAvailable (max 0 (long (or (:stock v) 0)))))))

(defn breadcrumbs [product cat-label subcat-label]
  (cond-> [{:label "Home" :href "/"}]
    cat-label    (conj {:label cat-label :href (str "/" (:category product))})
    subcat-label (conj {:label subcat-label
                        :href (str "/" (:category product) "/" (:subcategory product))})))

(defn product-detail
  [product {:keys [images variants rating cat-label subcat-label]}]
  (let [price      (:basePriceAmount product)
        compare-at (:compareAtAmount product)
        img-rows   (keep #(get images %) (:imageIds product))]
    {:id (:id product)
     :slug (:slug product)
     :name (:name product)
     :category (:category product)
     :subcategory (:subcategory product)
     :shortDescription (:shortDescription product)
     :story (:story product)
     :care (:care product)
     :specs (:specs product)
     :price (money/kes price)
     :compareAtPrice (money* compare-at)
     :onSale (on-sale? price compare-at)
     :isNew (new? product)
     :vatInclusive (boolean (:vatInclusive product))
     :images (mapv #(img-detail % (= (:id %) (:primaryImageId product))) img-rows)
     :optionAxes (:optionAxes product)
     :variants (mapv variant-detail variants)
     :sizeGuideCategory (:sizeGuideCategory product)
     :rating (rating-shape rating)
     :seo (:seo product)
     :breadcrumbs (breadcrumbs product cat-label subcat-label)}))
