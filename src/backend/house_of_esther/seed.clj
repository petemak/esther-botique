(ns house-of-esther.seed
  "Development / demo seed data. Run with:  clojure -X:seed
   Requires SEED_ADMIN_PASSWORD in the environment — no secrets are hardcoded.

   IMAGES: real photographs sourced from Pexels (Pexels License — free for
   commercial use, no attribution required). Per-image source page, photographer
   and licence are recorded in brand/seed-images/CREDITS.md; real dimensions and
   byte sizes come from brand/seed-images/manifest.json. The files themselves are
   deployed into the frontend static build and served from
   `{CDN_BASE_URL}/seed/{id}-{800|2000}.jpg` — CDN_BASE_URL is read from config
   so staging/prod can point at their own origin. A few products deliberately
   reuse another product's image id (e.g. the draft Nia jacket -> img_sena1);
   those now resolve to a real photo."
  (:require [buddy.hashers :as hashers]
            [clojure.tools.logging :as log]
            [house-of-esther.config :as config]
            [house-of-esther.db :as db]
            [house-of-esther.migrate :as migrate]))

(defn- img! [conn cdn {:keys [id alt width height full-bytes thumb-bytes]}]
  ;; upsert: re-seeding refreshes alt / dimensions / byte sizes when seed images
  ;; are re-sourced, without a full DB reset. URLs are derived from id + cdn.
  (db/exec! conn ["insert into images (id, alt, thumb_url, full_url, width, height, thumb_bytes, full_bytes)
                   values (?,?,?,?,?,?,?,?)
                   on conflict (id) do update set
                     alt = excluded.alt,
                     thumb_url = excluded.thumb_url,
                     full_url = excluded.full_url,
                     width = excluded.width,
                     height = excluded.height,
                     thumb_bytes = excluded.thumb_bytes,
                     full_bytes = excluded.full_bytes"
                  id alt
                  (str cdn "/seed/" id "-800.jpg")
                  (str cdn "/seed/" id "-2000.jpg")
                  width height thumb-bytes full-bytes]))

(def ^:private images
  ;; Real values from brand/seed-images/manifest.json (Pexels; see CREDITS.md).
  ;; Model/lifestyle shots feature Black / African models (Nairobi customer base).
  [{:id "img_orin1"           :width 1600 :height 2000 :full-bytes 250392 :thumb-bytes 36685
    :alt "Orin Linen Dress, front view - a Black woman in an olive-toned linen button-front dress stands beside a studio garment rail of linen pieces, soft natural light."}
   {:id "img_orin2"           :width 1600 :height 2000 :full-bytes 296830 :thumb-bytes 49240
    :alt "Orin Linen Dress, side view - the same olive linen dress seen from a three-quarter angle as the seated model considers a linen shirt on a hanger, sleeve detail and drape visible."}
   {:id "img_harlan1"         :width 1900 :height 1266 :full-bytes 287967 :thumb-bytes 58525
    :alt "Harlan Leather Crossbody in tan - the bag photographed on a woven rattan chair outdoors, adjustable strap and knot detail."}
   {:id "img_harlan2"         :width 1600 :height 2000 :full-bytes 163150 :thumb-bytes 27103
    :alt "Harlan Leather Bag in tan, worn - a Black woman in a black jumpsuit carries the tan leather bag in her hand against a warm sand-toned backdrop, mid-stride."}
   {:id "img_maren1"          :width 1600 :height 2000 :full-bytes 103242 :thumb-bytes 21398
    :alt "Maren Wide-Leg Trousers, full length - a Black woman wears the tan high-waisted wide-leg trousers with a matching blazer against a clean grey studio backdrop."}
   {:id "img_sena1"           :width 1600 :height 2000 :full-bytes 268902 :thumb-bytes 51769
    :alt "Sena Knit Top - a Black woman in a soft oat-coloured knit turtleneck, backlit by golden hour light, close warm-toned crop."}
   {:id "img_ada1"            :width 1333 :height 2000 :full-bytes 296833 :thumb-bytes 56440
    :alt "Ada Shirt Dress in olive - a belted olive utility shirt dress mid-movement in front of a pale stone building."}
   {:id "img_kito1"           :width 2000 :height 1334 :full-bytes 182070 :thumb-bytes 24002
    :alt "Kito Woven Tote - two natural handwoven straw totes on a warm peach background with a sprig of dried flowers."}
   {:id "img_lulu1"           :width 1333 :height 2000 :full-bytes 278273 :thumb-bytes 37039
    :alt "Lulu Gold Hoops - a pair of twisted gold hoop earrings resting on warm tan paper."}
   {:id "img_taza1"           :width 1333 :height 2000 :full-bytes 280610 :thumb-bytes 50278
    :alt "Taza Handwoven Throw - folded oat and cream knit throws stacked on a wooden stool against a muted grey-green backdrop."}
   {:id "img_cat_women"       :width 1600 :height 2000 :full-bytes 288457 :thumb-bytes 42295
    :alt "Women's collection - a Black woman in an olive linen dress leans on a garment rack hung with linen pieces in a softly lit studio."}
   {:id "img_cat_accessories" :width 1600 :height 2000 :full-bytes 283560 :thumb-bytes 54742
    :alt "Accessories collection - a tan croc-textured leather tote on a pedestal against a soft dusty-pink backdrop with dried flowers."}
   {:id "img_cat_home"        :width 1200 :height 1800 :full-bytes 285991 :thumb-bytes 58759
    :alt "Home collection - a rattan hanging chair layered with a knit throw and cushions on a patterned rug."}
   {:id "img_hero1"           :width 2000 :height 1200 :full-bytes 204261 :thumb-bytes 39173
    :alt "A Black woman in a cream jacket over a rust knit walks a city street mid-stride, soft daylight, editorial street style."}
   {:id "img_ed1"             :width 2000 :height 1300 :full-bytes 246874 :thumb-bytes 46591
    :alt "Editorial: in-between season layering - a Black woman in an oversized oat knit cardigan on an autumn woodland path strewn with fallen leaves."}
   {:id "img_ed2"             :width 2000 :height 1250 :full-bytes 295650 :thumb-bytes 43830
    :alt "Editorial: leather goods - a Black woman in a cream blazer holds a tan leather portfolio under her arm on a transit platform."}
   {:id "img_j_sept"          :width 2000 :height 1300 :full-bytes 267923 :thumb-bytes 40870
    :alt "Journal: autumn styling - a Black woman in a belted beige trench coat over a white ribbed turtleneck on a city street."}
   {:id "img_j_leather"       :width 1720 :height 1150 :full-bytes 296208 :thumb-bytes 56659
    :alt "Journal: leather care - a close-up of smooth tan leather showing grain, seam and strap detail."}
   {:id "img_j_sizing"        :width 2000 :height 1300 :full-bytes 238082 :thumb-bytes 32840
    :alt "Journal: fit and tailoring - a tailor's tape measure coiled on a dark work surface, warm side light."}
   {:id "img_col_workwear"    :width 2000 :height 1000 :full-bytes 178456 :thumb-bytes 26450
    :alt "Workwear collection - two Black women in tailored shirts and a leather waist belt on a pale studio backdrop."}
   {:id "img_col_new"         :width 2000 :height 1000 :full-bytes 275964 :thumb-bytes 49651
    :alt "New season collection - a Black woman in a white broderie dress stands among trees in warm, soft light."}])

(defn- money [a] a)

(def ^:private categories
  [["women" "Women" "Considered workwear and off-duty pieces, cut for real life." "img_cat_women" nil 1]
   ["accessories" "Accessories" "Leather, gold and woven pieces made to last." "img_cat_accessories" nil 2]
   ["home" "Home" "Small-batch textiles and ceramics for a calm room." "img_cat_home" nil 3]
   ["dresses" "Dresses" nil nil "women" 1]
   ["tops" "Tops" nil nil "women" 2]
   ["trousers" "Trousers" nil nil "women" 3]
   ["bags" "Bags" nil nil "accessories" 1]
   ["jewellery" "Jewellery" nil nil "accessories" 2]
   ["textiles" "Textiles" nil nil "home" 1]])

(defn- product!
  [conn {:keys [id slug name category subcategory short story care price compare
                images primary size-guide status specs axes variants]}]
  (db/exec! conn ["insert into products (id, slug, name, category, subcategory, short_description, story, care, specs,
                                         base_price_amount, compare_at_amount, vat_inclusive, option_axes, image_ids,
                                         primary_image_id, size_guide_category, seo, status, published_at)
                   values (?,?,?,?,?,?,?,?,?,?,?,true,?,?,?,?,?,?, case when ?='published' then now() else null end)
                   on conflict (id) do nothing"
                  id slug name category subcategory short story care (vec (or specs []))
                  (money price) (some-> compare money) (vec (or axes []))
                  (vec images) primary size-guide
                  {:title (str name " — House of Esther") :description short}
                  status status])
  (doseq [{:keys [vid sku options vprice vcompare stock low image]} variants]
    (db/exec! conn ["insert into product_variants (id, product_id, sku, options, price_amount, compare_at_amount, stock, low_stock_threshold, image_id, enabled)
                     values (?,?,?,?,?,?,?,?,?,true)
                     on conflict (id) do nothing"
                    vid id sku options (money (or vprice price)) (some-> (or vcompare compare) money)
                    stock (or low 2) image])))

(def ^:private products
  [{:id "prod_orin" :slug "orin-linen-dress" :name "Orin Linen Dress" :category "women" :subcategory "dresses"
    :short "A relaxed midi in washed European linen with a self-tie waist."
    :story "<p>We chose a mid-weight linen that softens with every wash and holds its shape through a Nairobi afternoon.</p>"
    :care "Machine wash cold, line dry in shade, warm iron while slightly damp."
    :price 5400 :compare 6800 :images ["img_orin1" "img_orin2"] :primary "img_orin1" :size-guide "dresses" :status "published"
    :specs [{:label "Material" :value "100% washed linen"} {:label "Fit" :value "Relaxed, true to size"} {:label "Origin" :value "Made in Kenya"}]
    :axes [{:name "Colour" :values ["Oat" "Black"]} {:name "Size" :values ["XS" "S" "M" "L" "XL"]}]
    :variants (for [[c ci] [["Oat" "OAT"] ["Black" "BLK"]]
                    [s st]  [["XS" 3] ["S" 6] ["M" 2] ["L" 5] ["XL" 4]]]
                {:vid (str "var_orin_" ci "_" s) :sku (str "ORIN-" ci "-" s)
                 :options {"Colour" c "Size" s} :stock st :image "img_orin1"})}

   {:id "prod_harlan" :slug "harlan-leather-crossbody" :name "Harlan Leather Crossbody" :category "accessories" :subcategory "bags"
    :short "A compact everyday crossbody in vegetable-tanned leather."
    :story "<p>Vegetable-tanned hide that darkens and softens with use instead of cracking. Solid brass hardware.</p>"
    :care "Wipe with a dry cloth. Condition twice a year. Keep out of prolonged direct sun."
    :price 6800 :compare 8200 :images ["img_harlan1" "img_harlan2"] :primary "img_harlan1" :size-guide "bags" :status "published"
    :specs [{:label "Material" :value "Vegetable-tanned cowhide"} {:label "Dimensions" :value "24 x 16 x 7 cm"} {:label "Origin" :value "Made in Kenya"}]
    :axes [{:name "Colour" :values ["Tan" "Black"]} {:name "Size" :values ["One size"]}]
    :variants [{:vid "var_harlan_tan" :sku "HAR-CB-TAN-OS" :options {"Colour" "Tan" "Size" "One size"} :stock 7 :image "img_harlan1"}
               {:vid "var_harlan_blk" :sku "HAR-CB-BLK-OS" :options {"Colour" "Black" "Size" "One size"} :stock 2 :low 3 :image "img_harlan2"}]}

   {:id "prod_maren" :slug "maren-wide-leg-trousers" :name "Maren Wide-Leg Trousers" :category "women" :subcategory "trousers"
    :short "High-rise wide-leg trousers in a fluid twill that presses sharp."
    :story "<p>Cut long so you can hem to your heel. A hook-and-bar closure and grosgrain-lined waistband.</p>"
    :care "Dry clean, or machine wash cold on gentle and hang to dry."
    :price 6200 :images ["img_maren1"] :primary "img_maren1" :size-guide "trousers" :status "published"
    :specs [{:label "Material" :value "68% viscose, 32% linen"} {:label "Inseam" :value "84 cm (unhemmed)"}]
    :axes [{:name "Colour" :values ["Ink" "Stone"]} {:name "Size" :values ["S" "M" "L" "XL"]}]
    :variants (for [[c ci] [["Ink" "INK"] ["Stone" "STN"]] [s st] [["S" 4] ["M" 0] ["L" 3] ["XL" 5]]]
                {:vid (str "var_maren_" ci "_" s) :sku (str "MAREN-" ci "-" s) :options {"Colour" c "Size" s} :stock st :image "img_maren1"})}

   {:id "prod_sena" :slug "sena-ribbed-knit-top" :name "Sena Ribbed Knit Top" :category "women" :subcategory "tops"
    :short "A slim ribbed top in breathable cotton-modal with a clean neckline."
    :story "<p>The everyday layer we kept reaching for. Holds shape, doesn't pill.</p>"
    :care "Machine wash cold, dry flat."
    :price 2800 :images ["img_sena1"] :primary "img_sena1" :size-guide "tops" :status "published"
    :specs [{:label "Material" :value "62% cotton, 33% modal, 5% elastane"}]
    :axes [{:name "Colour" :values ["Cream" "Black" "Sage"]} {:name "Size" :values ["XS" "S" "M" "L"]}]
    :variants (for [[c ci] [["Cream" "CRM"] ["Black" "BLK"] ["Sage" "SGE"]] [s st] [["XS" 5] ["S" 8] ["M" 6] ["L" 4]]]
                {:vid (str "var_sena_" ci "_" s) :sku (str "SENA-" ci "-" s) :options {"Colour" c "Size" s} :stock st :image "img_sena1"})}

   {:id "prod_ada" :slug "ada-shirt-dress" :name "Ada Shirt Dress" :category "women" :subcategory "dresses"
    :short "A collared shirt dress in cotton poplin with a removable belt."
    :story "<p>Works open over trousers or belted on its own.</p>"
    :care "Machine wash cold, warm iron."
    :price 4900 :images ["img_ada1"] :primary "img_ada1" :size-guide "dresses" :status "published"
    :specs [{:label "Material" :value "100% cotton poplin"}]
    :axes [{:name "Colour" :values ["Olive" "White"]} {:name "Size" :values ["S" "M" "L" "XL"]}]
    :variants (for [[c ci] [["Olive" "OLV"] ["White" "WHT"]] [s st] [["S" 3] ["M" 4] ["L" 2] ["XL" 3]]]
                {:vid (str "var_ada_" ci "_" s) :sku (str "ADA-" ci "-" s) :options {"Colour" c "Size" s} :stock st :image "img_ada1"})}

   {:id "prod_kito" :slug "kito-woven-tote" :name "Kito Woven Tote" :category "accessories" :subcategory "bags"
    :short "A generous market tote handwoven from sisal with leather handles."
    :story "<p>Woven by a women's cooperative in Kitui. Every piece varies slightly.</p>"
    :care "Spot clean. Reshape damp."
    :price 3600 :images ["img_kito1"] :primary "img_kito1" :size-guide "bags" :status "published"
    :specs [{:label "Material" :value "Sisal, leather handles"} {:label "Dimensions" :value "40 x 35 x 14 cm"}]
    :axes [{:name "Colour" :values ["Natural"]} {:name "Size" :values ["One size"]}]
    :variants [{:vid "var_kito_nat" :sku "KITO-NAT-OS" :options {"Colour" "Natural" "Size" "One size"} :stock 12 :image "img_kito1"}]}

   {:id "prod_lulu" :slug "lulu-gold-hoops" :name "Lulu Gold Hoops" :category "accessories" :subcategory "jewellery"
    :short "Lightweight 18k gold-plated hoops for everyday wear."
    :story "<p>Brass core, thick gold plating, hypoallergenic posts.</p>"
    :care "Keep dry. Store in the pouch provided."
    :price 2200 :images ["img_lulu1"] :primary "img_lulu1" :size-guide nil :status "published"
    :specs [{:label "Material" :value "18k gold-plated brass"} {:label "Diameter" :value "30 mm"}]
    :axes [{:name "Colour" :values ["Gold"]} {:name "Size" :values ["One size"]}]
    :variants [{:vid "var_lulu_gold" :sku "LULU-GLD-OS" :options {"Colour" "Gold" "Size" "One size"} :stock 20 :image "img_lulu1"}]}

   {:id "prod_taza" :slug "taza-handwoven-throw" :name "Taza Handwoven Throw" :category "home" :subcategory "textiles"
    :short "A cotton throw handwoven on traditional looms, fringed by hand."
    :story "<p>Made in small runs; slubs and slight irregularities are part of it.</p>"
    :care "Gentle cold wash, dry flat."
    :price 4200 :images ["img_taza1"] :primary "img_taza1" :size-guide nil :status "published"
    :specs [{:label "Material" :value "100% cotton"} {:label "Dimensions" :value "130 x 170 cm"}]
    :axes [{:name "Colour" :values ["Oat" "Charcoal"]} {:name "Size" :values ["One size"]}]
    :variants [{:vid "var_taza_oat" :sku "TAZA-OAT-OS" :options {"Colour" "Oat" "Size" "One size"} :stock 6 :image "img_taza1"}
               {:vid "var_taza_chr" :sku "TAZA-CHR-OS" :options {"Colour" "Charcoal" "Size" "One size"} :stock 4 :image "img_taza1"}]}

   {:id "prod_draft" :slug "nia-cropped-jacket" :name "Nia Cropped Jacket" :category "women" :subcategory "tops"
    :short "A boxy cropped jacket in cotton canvas. Launching soon."
    :story "<p>Still in sampling.</p>" :care "TBC"
    :price 7800 :images ["img_sena1"] :primary "img_sena1" :size-guide "tops" :status "draft"
    :axes [{:name "Colour" :values ["Khaki"]} {:name "Size" :values ["S" "M" "L"]}]
    :variants [{:vid "var_nia_s" :sku "NIA-KHK-S" :options {"Colour" "Khaki" "Size" "S"} :stock 0 :image "img_sena1"}]}])

(def ^:private collections
  [["workwear" "Workwear" "Considered pieces for the working week — pressed, comfortable, unfussy."
    "img_col_workwear" {:type "manual" :productIds ["prod_maren" "prod_ada" "prod_sena" "prod_orin"]}]
   ["new-arrivals" "New Arrivals" "The latest to land." "img_col_new" {:type "auto_new_arrivals" :days 30}]])

(def ^:private journal-posts
  [["september-edit" "The September Edit" "Dressing for the in-between season, one honest layer at a time." "lookbook"
    "img_j_sept" "img_j_sept" "<p>September in Nairobi asks for layers you can shed by noon...</p>"
    ["prod_orin" "prod_maren" "prod_sena"] ["caring-for-leather" "honest-sizing"]]
   ["caring-for-leather" "Caring for Leather" "Simple habits that make vegetable-tanned leather last decades." "guide"
    "img_j_leather" "img_j_leather" "<p>Vegetable-tanned leather is alive...</p>" ["prod_harlan"] ["september-edit"]]
   ["honest-sizing" "On Honest Sizing" "Why our size guide lists real garment measurements, not vanity numbers." "notebook"
    "img_j_sizing" "img_j_sizing" "<p>We measure every sample flat...</p>" ["prod_sena" "prod_ada"] ["september-edit"]]])

(def ^:private zones
  [["nairobi" "Nairobi" ["Nairobi"] 1
    [["nairobi_next_day" "Nairobi next-day" 300 "1-2 business days" true 1]]]
   ["major_towns" "Major towns" ["Mombasa" "Kisumu" "Nakuru" "Eldoret" "Thika" "Nyeri" "Machakos" "Kericho" "Kakamega"] 2
    [["town_courier" "Courier to town" 450 "2-4 business days" true 1]]]
   ["rest_of_kenya" "Rest of Kenya" ["Kilifi" "Kwale" "Garissa" "Isiolo" "Marsabit" "Turkana" "Wajir" "Mandera" "Narok" "Kajiado" "Bomet" "Migori" "Homa Bay" "Siaya" "Busia" "Bungoma" "Trans Nzoia" "Uasin Gishu" "Elgeyo-Marakwet" "Nandi" "Baringo" "Laikipia" "Nyandarua" "Kirinyaga" "Murang'a" "Kiambu" "Embu" "Tharaka-Nithi" "Meru" "Kitui" "Makueni" "Taita-Taveta" "Lamu" "Tana River" "Samburu" "West Pokot" "Vihiga" "Nyamira" "Kisii"] 3
    [["upcountry_courier" "Upcountry courier" 650 "3-6 business days" false 1]]]])

(def ^:private legal-docs
  [["terms-of-sale" 4 "2026-07-01" "Terms of Sale"
    "<h2>1. These terms</h2><p>These Terms of Sale govern your purchase of goods from House of Esther.</p><h2>2. Orders</h2><p>An order is accepted when we confirm it and payment is received or, for pay-on-delivery, when we dispatch it.</p><h2>3. Pricing</h2><p>Prices are in Kenyan shillings and include VAT where applicable.</p>"]
   ["returns" 2 "2026-05-01" "Returns Policy"
    "<h2>Returns</h2><p>You may return unworn items with tags within 14 days of delivery for an exchange or refund, less the original delivery fee.</p><h2>Faulty items</h2><p>We cover return delivery for faulty or incorrect items.</p>"]
   ["privacy" 3 "2026-03-15" "Privacy Policy"
    "<h2>What we collect</h2><p>Contact and delivery details, order history, and payment confirmations from Safaricom. We never store card or M-Pesa PINs.</p>"]])

(def ^:private home-content
  {:announcement {:enabled true :text "Delivered countrywide. Pay with M-Pesa or on delivery." :href "/delivery-returns"}
   :hero {:headline "Style worth the wait"
          :subcopy "Curated pieces, honest sizing, delivered to your door."
          :ctaLabel "Shop new in" :ctaHref "/new-in" :imageId "img_hero1"}
   :categoryTiles [{:label "Women" :href "/women" :imageId "img_cat_women"}
                   {:label "Accessories" :href "/accessories" :imageId "img_cat_accessories"}
                   {:label "Home" :href "/home" :imageId "img_cat_home"}]
   :editorialBlocks [{:id "eb_1" :caption "The September edit: dressing for the in-between season" :imageId "img_ed1" :href "/journal/september-edit"}
                     {:id "eb_2" :caption "The leather edit" :imageId "img_ed2" :href "/collections/accessories"}]
   :featuredCollectionSlug "workwear"
   :socialLinks [{:platform "instagram" :url "https://instagram.com/houseofesther"}
                 {:platform "tiktok" :url "https://tiktok.com/@houseofesther"}]})

(def ^:private discounts
  [["WELCOME10" "percent" 10 3000 500 1 [] "2026-01-01T00:00:00Z" "2026-12-31T23:59:59Z" true]
   ["FREESHIP" "free_delivery" 0 5000 nil nil [] "2026-01-01T00:00:00Z" "2026-12-31T23:59:59Z" true]])

(defn seed! [conn cfg]
  (let [cdn (:cdn-base-url cfg)]
    (doseq [im images] (img! conn cdn im)))
  (doseq [[slug label desc img parent ord] categories]
    (db/exec! conn ["insert into categories (slug, label, description, image_id, parent_slug, sort_order)
                     values (?,?,?,?,?,?) on conflict (slug) do nothing" slug label desc img parent ord]))
  (doseq [p products] (product! conn p))
  (doseq [[slug title desc img rule] collections]
    (db/exec! conn ["insert into collections (slug, title, description, hero_image_id, rule)
                     values (?,?,?,?,?) on conflict (slug) do nothing" slug title desc img rule]))
  (doseq [[slug title excerpt tag cover hero body shop related] journal-posts]
    (db/exec! conn ["insert into journal_posts (slug, title, excerpt, tag, cover_image_id, hero_image_id, body_html, shop_the_look_ids, related_slugs, seo, status, published_at)
                     values (?,?,?,?,?,?,?,?,?,?, 'published', now()) on conflict (slug) do nothing"
                    slug title excerpt tag cover hero body (vec shop) (vec related)
                    {:title (str title " — The Journal — House of Esther") :description excerpt}]))
  (doseq [[code label counties ord methods] zones]
    (db/exec! conn ["insert into delivery_zones (code, label, counties, sort_order) values (?,?,?,?)
                     on conflict (code) do nothing" code label (vec counties) ord])
    (doseq [[mcode mlabel fee eta pod mord] methods]
      (db/exec! conn ["insert into delivery_methods (code, zone_code, label, fee_amount, eta, pay_on_delivery_allowed, sort_order)
                       values (?,?,?,?,?,?,?) on conflict (code) do nothing"
                      mcode code mlabel fee eta pod mord])))
  (doseq [[dt v eff title body] legal-docs]
    (db/exec! conn ["insert into legal_documents (doc_type, version, effective_date, title, body_html)
                     values (?,?,?::date,?,?) on conflict (doc_type, version) do nothing" dt v eff title body]))
  ;; a couple of older versions so historical acceptance records stay resolvable
  (db/exec! conn ["insert into legal_documents (doc_type, version, effective_date, title, body_html)
                   values ('terms-of-sale', 3, '2026-02-01', 'Terms of Sale', '<h2>1. These terms</h2><p>Superseded version.</p>')
                   on conflict do nothing"])
  (db/exec! conn ["insert into legal_documents (doc_type, version, effective_date, title, body_html)
                   values ('returns', 1, '2026-02-01', 'Returns Policy', '<h2>Returns</h2><p>Superseded version.</p>')
                   on conflict do nothing"])
  (db/exec! conn ["insert into home_content (id, data) values (1, ?)
                   on conflict (id) do update set data = excluded.data" home-content])
  (doseq [[code type v min tot per cats starts ends active] discounts]
    (db/exec! conn ["insert into discounts (code, type, value, min_spend_amount, usage_limit_total, usage_limit_per_customer,
                                            eligible_categories, starts_at, ends_at, active)
                     values (?,?,?,?,?,?,?,?::timestamptz,?::timestamptz,?) on conflict (code) do nothing"
                    code type v min tot per (vec cats) starts ends active]))
  ;; admin user — password strictly from the environment
  (let [{:keys [admin-email admin-name admin-password]} (:seed cfg)]
    (when-not admin-password
      (throw (ex-info "SEED_ADMIN_PASSWORD must be set to seed the admin user" {})))
    (db/exec! conn ["insert into admin_users (id, name, email, password_hash, role)
                     values ('usr_admin1', ?, ?, ?, 'admin')
                     on conflict (email) do update set password_hash = excluded.password_hash, name = excluded.name"
                    admin-name admin-email (hashers/derive admin-password)])))

(defn -main [& _]
  (let [cfg (config/load-config)]
    (db/start-pool! cfg)
    (migrate/migrate! (:database-url cfg))
    (db/with-tx [conn] (seed! conn cfg))
    (db/stop-pool!)
    (log/info "seed complete")
    (shutdown-agents)))
