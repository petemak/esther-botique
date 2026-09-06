(ns house-of-esther.seed
  "Development / demo seed data. Run with:  clojure -X:seed
   Requires SEED_ADMIN_PASSWORD in the environment — no secrets are hardcoded.

   IMAGES: every image below is a NEUTRAL PLACEHOLDER. The URLs match the
   production CDN shape (cdn.houseofesther.co.ke/...) but do not resolve to a
   real photo. Do NOT treat these as real product photography — see the
   backend README for the list of items that still need a real, category-matched
   image before launch."
  (:require [buddy.hashers :as hashers]
            [clojure.tools.logging :as log]
            [house-of-esther.config :as config]
            [house-of-esther.db :as db]
            [house-of-esther.migrate :as migrate]))

(def ^:private cdn "https://cdn.houseofesther.co.ke")

(defn- img! [conn id alt w h]
  (db/exec! conn ["insert into images (id, alt, thumb_url, full_url, width, height, thumb_bytes, full_bytes)
                   values (?,?,?,?,?,?,?,?)
                   on conflict (id) do nothing"
                  id alt
                  (str cdn "/seed/" id "-800.webp")
                  (str cdn "/seed/" id "-2000.webp")
                  w h 42000 240000]))

(def ^:private images
  ;; id, alt, width, height  — PLACEHOLDERS, need real photos
  [["img_hero1"  "Model in a linen co-ord walking a Nairobi street at golden hour" 2000 1200]
   ["img_cat_women"     "Flat lay of neutral-tone women's workwear" 800 1000]
   ["img_cat_accessories" "Tan leather bags arranged on a bench" 800 1000]
   ["img_cat_home"      "Woven throw and ceramic mug on a wooden stool" 800 1000]
   ["img_ed1" "Editorial: layering for the in-between season" 2000 1400]
   ["img_ed2" "Editorial: the leather edit" 2000 1400]
   ["img_orin1" "Orin linen dress, front view" 2000 2500]
   ["img_orin2" "Orin linen dress, back view" 2000 2500]
   ["img_harlan1" "Harlan leather crossbody, front" 2000 2500]
   ["img_harlan2" "Harlan leather crossbody, worn" 2000 2500]
   ["img_maren1" "Maren wide-leg trousers, full length" 2000 2500]
   ["img_sena1" "Sena ribbed knit top, front" 2000 2500]
   ["img_ada1" "Ada shirt dress in olive" 2000 2500]
   ["img_kito1" "Kito woven tote, natural" 2000 2500]
   ["img_lulu1" "Lulu gold hoop earrings" 2000 2500]
   ["img_taza1" "Taza handwoven throw, oat" 2000 2500]
   ["img_j_sept" "September edit cover" 2000 1200]
   ["img_j_leather" "Caring for leather cover" 2000 1200]
   ["img_j_sizing" "Honest sizing cover" 2000 1200]
   ["img_col_workwear" "Workwear collection hero" 2000 1000]
   ["img_col_new" "New arrivals collection hero" 2000 1000]])

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
  (doseq [[id alt w h] images] (img! conn id alt w h))
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
