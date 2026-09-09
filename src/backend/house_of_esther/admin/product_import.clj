(ns house-of-esther.admin.product-import
  "A17 — product CSV bulk import / export (staff-level admin work).

   Two-step write path: POST /products/import parses + validates + PLANS a file
   against the current catalogue and writes NOTHING; POST /products/import/commit
   applies a previously-cached plan. GET /products/export and
   GET /products/import/template are downloads.

   Handlers stay thin: `build-plan` / `run-commit!` hold the logic and are
   testable without HTTP. All four endpoints sit behind `require-admin`."
  (:require [clojure.data.csv :as csv]
            [clojure.string :as str]
            [house-of-esther.admin.inventory :as inv]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.idempotency :as idem]
            [house-of-esther.util :as u])
  (:import [java.io StringWriter]))

;; --- slug / SKU (must match the frontend product-form rules) ---------------

(defn slugify
  "EXACTLY the product create form's rule:
   s.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
   No transliteration — accented letters collapse to '-'."
  [s]
  (-> (or s "")
      str/lower-case
      str/trim
      (str/replace #"[^a-z0-9]+" "-")
      (str/replace #"^-|-$" "")))

(defn- base-sku
  "Deterministic SKU stem from the slug: upper-cased, every non-alphanumeric -> '-'."
  [slug]
  (str/replace (str/upper-case slug) #"[^A-Z0-9]" "-"))

(defn- unique-sku
  "base-sku, with -2, -3, ... appended until it doesn't collide with an
   existing product_variants.sku."
  [conn base]
  (loop [n 1]
    (let [candidate (if (= n 1) base (str base "-" n))]
      (if (db/q1 conn ["select 1 from product_variants where sku = ?" candidate])
        (recur (inc n))
        candidate))))

;; --- CSV column mapping ---------------------------------------------------

(def ^:private synonyms
  {:name        #{"name" "product" "title"}
   :price       #{"price" "amount" "price (kes)"}
   :description #{"description" "desc" "short description"}
   :quantity    #{"quantity" "qty" "stock"}
   :category    #{"category" "cat"}})

(defn- header-index
  "Header cells -> {canonical-key column-index}. Names are trimmed and
   lower-cased; order-independent; unknown columns ignored; first match wins."
  [header-cells]
  (reduce
   (fn [acc [idx cell]]
     (let [norm (str/lower-case (str/trim (str cell)))]
       (reduce (fn [a [canon syns]]
                 (if (and (contains? syns norm) (not (contains? a canon)))
                   (assoc a canon idx)
                   a))
               acc
               synonyms)))
   {}
   (map-indexed vector header-cells)))

(defn- cell [row idx]
  (when idx (some-> (get row idx) str str/trim)))

;; --- number parsing -----------------------------------------------------

(defn parse-whole
  "Whole-number parse for price / quantity. Accepts thousands separators,
   surrounding spaces and a zero fractional part ('5,400', ' 5400 ', '5400.00').
   Rejects currency prefixes, '/-', negatives, blanks and anything non-numeric
   -> nil."
  [s]
  (when s
    (let [t (str/trim s)]
      (when-not (str/blank? t)
        (let [c (str/replace t "," "")]
          (cond
            (re-matches #"\d+" c) (parse-long c)
            (re-matches #"\d+\.0+" c) (parse-long (subs c 0 (str/index-of c ".")))
            :else nil))))))

;; --- category resolution ----------------------------------------------

(defn- resolve-category
  "Match `raw` to an existing category on slug OR label, case-insensitively.
   Returns the canonical category slug, or nil."
  [conn raw]
  (when (and raw (not (str/blank? raw)))
    (let [t (str/lower-case (str/trim raw))]
      (:slug (db/q1 conn ["select slug from categories
                           where lower(slug) = ? or lower(label) = ? limit 1" t t])))))

;; --- per-row planning -------------------------------------------------

(def ^:private note-created
  "Created as a draft — add photos and publish from the Products page")
(def ^:private note-multi
  "Displayed price and description updated — set stock and per-option prices on the product page")
(def ^:private note-ambiguous
  "More than one product matches this name — edit it on the Products page")
(def ^:private note-archived
  "This product is archived — restore it first, then re-import")
(def ^:private note-no-change
  "No changes — already up to date")

(defn- err-row [base msg]
  (assoc base :action "error" :message msg))

(defn- plan-update
  "Plan an `update`, a no-op `skip`, or an `error` for a row that matched
   exactly one non-archived product `p`. A matched row with no effective field
   change is planned as `skip` (note 'No changes — already up to date') so it
   never lands in `toUpdate` and writes nothing at commit."
  [conn base p {:keys [price qty-raw desc-present? desc-raw cat-present? cat-raw]}]
  (let [variants (db/q conn ["select id, stock from product_variants
                              where product_id = ? order by created_at" (:id p)])
        vc       (count variants)
        cur-base (long (:basePriceAmount p))
        cur-desc (or (:shortDescription p) "")
        cur-cat  (:category p)
        cat-given? (and cat-present? (not (str/blank? cat-raw)))
        cat-slug (when cat-given? (resolve-category conn cat-raw))
        price-changed? (not= price cur-base)
        desc-changed?  (boolean (and desc-present? (not (str/blank? desc-raw)) (not= desc-raw cur-desc)))
        cat-changed?   (boolean (and cat-given? (some? cat-slug) (not= cat-slug cur-cat)))
        desc-change (when desc-present? {:changed desc-changed?})
        cat-change  (when cat-given? {:from cur-cat :to cat-slug})]
    (cond
      (and cat-given? (nil? cat-slug))
      (err-row base (str "There's no category called \"" cat-raw "\" — add it on the Categories page first."))

      (= vc 1)
      (let [qty (parse-whole qty-raw)]
        (if (nil? qty)
          (err-row base "Quantity must be a whole number (zero or more).")
          (let [cur-stock (long (:stock (first variants)))
                qty-changed? (not= qty cur-stock)
                changes (cond-> {}
                          price-changed? (assoc :price {:from cur-base :to price})
                          desc-change    (assoc :description desc-change)
                          cat-change     (assoc :category cat-change)
                          qty-changed?   (assoc :quantity {:from cur-stock :to qty}))]
            (if (or price-changed? desc-changed? cat-changed? qty-changed?)
              (assoc base :action "update" :changes changes
                     :apply {:kind :update-single
                             :product-id (:id p)
                             :variant-id (:id (first variants))
                             :price (when price-changed? price)
                             :set-desc (when desc-changed? desc-raw)
                             :category (when cat-changed? cat-slug)
                             :from-stock (when qty-changed? cur-stock)
                             :to-stock (when qty-changed? qty)})
              (assoc base :action "skip" :changes {} :notes [note-no-change])))))

      :else
      (let [qty (parse-whole qty-raw)]
        (if (and (not (str/blank? (or qty-raw ""))) (nil? qty))
          (err-row base "Quantity must be a whole number (zero or more).")
          (let [changes (cond-> {}
                          price-changed? (assoc :price {:from cur-base :to price})
                          desc-change    (assoc :description desc-change)
                          cat-change     (assoc :category cat-change))]
            (if (or price-changed? desc-changed? cat-changed?)
              (assoc base :action "update" :changes changes :notes [note-multi]
                     :apply {:kind :update-multi
                             :product-id (:id p)
                             :price (when price-changed? price)
                             :set-desc (when desc-changed? desc-raw)
                             :category (when cat-changed? cat-slug)})
              (assoc base :action "skip" :changes {} :notes [note-no-change]))))))))

(defn- plan-create
  [conn base slug nm {:keys [price qty-raw desc-present? desc-raw cat-present? cat-raw]}]
  (let [cat-slug (resolve-category conn cat-raw)
        qty (parse-whole qty-raw)]
    (cond
      (or (not cat-present?) (str/blank? (or cat-raw "")))
      (err-row base "category is required for a new product.")

      (nil? cat-slug)
      (err-row base (str "There's no category called \"" cat-raw "\" — add it on the Categories page first."))

      (nil? qty)
      (err-row base "Quantity must be a whole number (zero or more).")

      :else
      (let [changes (cond-> {:price {:from nil :to price}
                             :quantity {:from nil :to qty}}
                      desc-present? (assoc :description {:changed (not (str/blank? desc-raw))})
                      cat-present?  (assoc :category {:from nil :to cat-slug}))]
        (assoc base :action "create" :changes changes :notes [note-created]
               :apply {:kind :create
                       :name nm
                       :slug slug
                       :category cat-slug
                       :short-description (when (and desc-present? (not (str/blank? desc-raw))) desc-raw)
                       :price price
                       :quantity qty})))))

(defn- plan-row
  "Plan one data row. Returns [plan-row-map new-seen] where `seen` maps
   slug -> first row number that used it (for in-file duplicate detection)."
  [conn row-num row hidx seen]
  (let [nm            (cell row (:name hidx))
        desc-present? (contains? hidx :description)
        cat-present?  (contains? hidx :category)
        fields        {:price         (parse-whole (cell row (:price hidx)))
                       :qty-raw       (cell row (:quantity hidx))
                       :desc-present? desc-present?
                       :desc-raw      (when desc-present? (cell row (:description hidx)))
                       :cat-present?  cat-present?
                       :cat-raw       (when cat-present? (cell row (:category hidx)))}
        base          {:row row-num :name (or nm "") :slug "" :changes {} :notes [] :message nil}]
    (cond
      (str/blank? (or nm ""))
      [(err-row base "Give this row a product name so we can match or create it.") seen]

      :else
      (let [slug (slugify nm)
            base (assoc base :slug slug)]
        (cond
          (contains? seen slug)
          [(err-row base (str "Duplicate of row " (get seen slug)
                              " — only the first row for a product name is used")) seen]

          :else
          (let [seen' (assoc seen slug row-num)]
            (if (nil? (:price fields))
              [(err-row base "Price must be a whole number of shillings.") seen']
              (let [matches (db/q conn ["select id, status, category,
                                                base_price_amount as \"basePriceAmount\",
                                                short_description as \"shortDescription\"
                                         from products where slug = ?" slug])]
                (cond
                  (> (count matches) 1)
                  [(assoc base :action "skip" :notes [note-ambiguous]) seen']

                  (and (= 1 (count matches)) (= "archived" (:status (first matches))))
                  [(assoc base :action "skip" :notes [note-archived]) seen']

                  (= 1 (count matches))
                  [(plan-update conn base (first matches) fields) seen']

                  :else
                  [(plan-create conn base slug nm fields) seen'])))))))))

;; --- structural parse + full plan ------------------------------------

(defn- parse-csv [content]
  (try (doall (csv/read-csv content)) (catch Exception _ nil)))

(defn- comment-line? [row]
  (str/starts-with? (str/trim (str (first row))) "#"))

(defn- blank-line? [row]
  (every? #(str/blank? (str %)) row))

(defn- not-a-csv?
  "Lightweight pre-parse guard: a real CSV export/template is plain text and its
   first meaningful line (the header) has a comma. Binary uploads (a PNG, an
   XLSX) trip the NUL-byte check or the no-comma-header check before data.csv
   turns them into misleading 'missing column' errors."
  [^String content]
  (or (>= (.indexOf content 0) 0)
      (not (some-> (->> (str/split-lines content)
                        (remove #(str/starts-with? (str/trim %) "#"))
                        (remove str/blank?)
                        first)
                   (str/includes? ",")))))

(defn build-plan
  "Parse + validate + plan `content` against the catalogue on `conn`.
   Throws 422 validation_error for a structurally unusable file. Otherwise
   returns {:rows [plan-row ...]}. Row numbers are spreadsheet-style with the
   header at 1 (# comment lines and wholly-blank lines are dropped and do not
   consume a number)."
  [conn content]
  (when (str/blank? content)
    (throw (err/validation "That file has no header row.")))
  (when (not-a-csv? content)
    (throw (err/validation
            "That file doesn't look like a CSV — export your products or download the template to get the right format.")))
  (let [all (parse-csv content)]
    (when (nil? all)
      (throw (err/validation "We couldn't read that file as CSV.")))
    (let [lines  (->> all (remove comment-line?) (remove blank-line?))]
      (when (empty? lines)
        (throw (err/validation "That file has no header row.")))
      (let [header (first lines)
            hidx   (header-index header)]
        (doseq [c [:name :price :quantity]]
          (when-not (contains? hidx c)
            (throw (err/validation
                    (str "The file needs a \"" (name c) "\" column (name, price and quantity are required).")))))
        (let [data (rest lines)]
          (when (empty? data)
            (throw (err/validation "That file has a header row but no product rows.")))
          (when (> (count data) 1000)
            (throw (err/validation "That file has more than 1000 product rows — split it into batches.")))
          {:rows (loop [[d & more] data, n 2, seen {}, acc []]
                   (if (nil? d)
                     acc
                     (let [[pr seen'] (plan-row conn n d hidx seen)]
                       (recur more (inc n) seen' (conj acc pr)))))})))))

(defn- summary [plan-rows]
  (let [by (group-by :action plan-rows)]
    {:toCreate  (count (by "create"))
     :toUpdate  (count (by "update"))
     :toSkip    (count (by "skip"))
     :errors    (count (by "error"))
     :totalRows (count plan-rows)}))

(defn- public-row [r]
  {:row     (:row r)
   :name    (:name r)
   :slug    (:slug r)
   :action  (:action r)
   :changes (:changes r)
   :notes   (:notes r)
   :message (:message r)})

;; --- plan cache -------------------------------------------------------
;; token -> {:rows [...] :created-at ms :consumed bool}
;; NOTE: single-instance assumption — the same class of in-memory state as the
;; rest of this codebase (e.g. the local image store in admin/images). A
;; multi-instance deployment must move this to Postgres or a shared cache.

(defonce ^:private plan-cache (atom {}))
(def ^:private ttl-ms (* 15 60 1000))

(defn- new-token [] (str "imp_" (subs (u/token) 0 12)))

(defn- put-plan! [rows]
  (let [token (new-token)]
    (swap! plan-cache assoc token {:rows rows
                                   :created-at (System/currentTimeMillis)
                                   :consumed false})
    token))

(defn- expired? [entry]
  (> (- (System/currentTimeMillis) (:created-at entry)) ttl-ms))

;; --- commit apply ----------------------------------------------------

(defn- friendly-failure [e]
  (or (:friendly (ex-data e))
      (when (err/api-error? e) (:message (ex-data e)))
      "This row could not be applied — re-export and try again."))

(defn- apply-create! [_admin-id r]
  (db/with-tx [conn]
    (let [a (:apply r)]
      (when (db/q1 conn ["select 1 from products where slug = ?" (:slug a)])
        (throw (ex-info "slug-taken"
                        {:friendly "Someone added a product with this name while you were reviewing — re-export and try again."})))
      (let [pid (u/prefixed-id "prod")
            vid (u/prefixed-id "var")
            sku (unique-sku conn (base-sku (:slug a)))]
        (db/exec! conn ["insert into products (id, slug, name, category, short_description, base_price_amount, status)
                         values (?,?,?,?,?,?, 'draft')"
                        pid (:slug a) (:name a) (:category a) (:short-description a) (:price a)])
        (db/exec! conn ["insert into product_variants
                           (id, product_id, sku, options, price_amount, stock, low_stock_threshold, enabled)
                         values (?,?,?,?,?,?,2,true)"
                        vid pid sku {} (:price a) (:quantity a)])
        pid))))

(defn- guard-product! [conn product-id]
  (let [p (db/q1 conn ["select id, status from products where id = ? for update" product-id])]
    (when (or (nil? p) (= "archived" (:status p)))
      (throw (ex-info "gone"
                      {:friendly "Someone edited this product while you were reviewing — re-export and try again."})))
    p))

(defn- apply-update-single! [admin-id r]
  (db/with-tx [conn]
    (let [a (:apply r)]
      (guard-product! conn (:product-id a))
      (let [vs (db/q conn ["select id from product_variants where product_id = ?" (:product-id a)])]
        (when (not= 1 (count vs))
          (throw (ex-info "variants-changed"
                          {:friendly "This product's variants changed while you were reviewing — re-export and try again."})))
        (let [touched? (atom false)]
          (when (some? (:price a))
            (db/exec! conn ["update products set base_price_amount = ? where id = ?" (:price a) (:product-id a)])
            (db/exec! conn ["update product_variants set price_amount = ? where id = ?" (:price a) (:variant-id a)])
            (reset! touched? true))
          (when (:set-desc a)
            (db/exec! conn ["update products set short_description = ? where id = ?" (:set-desc a) (:product-id a)])
            (reset! touched? true))
          (when (:category a)
            (db/exec! conn ["update products set category = ? where id = ?" (:category a) (:product-id a)])
            (reset! touched? true))
          (when (and (some? (:from-stock a)) (some? (:to-stock a)))
            (let [delta (- (long (:to-stock a)) (long (:from-stock a)))]
              (when-not (zero? delta)
                (inv/apply-adjustment! conn {:variant-id (:variant-id a)
                                             :delta delta
                                             :reason "bulk_import"
                                             :note "CSV bulk import"
                                             :admin-id admin-id})
                (reset! touched? true))))
          (when @touched?
            (db/exec! conn ["update products set updated_at = now() where id = ?" (:product-id a)])))
        (:product-id a)))))

(defn- apply-update-multi! [_admin-id r]
  (db/with-tx [conn]
    (let [a (:apply r)]
      (guard-product! conn (:product-id a))
      (let [touched? (atom false)]
        (when (some? (:price a))
          (db/exec! conn ["update products set base_price_amount = ? where id = ?" (:price a) (:product-id a)])
          (reset! touched? true))
        (when (:set-desc a)
          (db/exec! conn ["update products set short_description = ? where id = ?" (:set-desc a) (:product-id a)])
          (reset! touched? true))
        (when (:category a)
          (db/exec! conn ["update products set category = ? where id = ?" (:category a) (:product-id a)])
          (reset! touched? true))
        (when @touched?
          (db/exec! conn ["update products set updated_at = now() where id = ?" (:product-id a)])))
      (:product-id a))))

(defn run-commit!
  "Apply `plan-rows` (create / update / skip only — preview `error` rows are not
   carried in). Each create/update row runs in its own transaction; a row that
   fails is reported `failed` and the rest still commit. Returns the
   {created updated skipped failed rows} response body."
  [plan-rows admin-id]
  (reduce
   (fn [acc r]
     (case (:action r)
       "skip"
       (-> acc
           (update :skipped inc)
           (update :rows conj {:row (:row r) :name (:name r) :result "skipped"
                               :productId nil :message (first (:notes r))}))

       ("create" "update")
       (let [[ok? res]
             (try
               [true (case (get-in r [:apply :kind])
                       :create        (apply-create! admin-id r)
                       :update-single (apply-update-single! admin-id r)
                       :update-multi  (apply-update-multi! admin-id r))]
               (catch clojure.lang.ExceptionInfo e [false (friendly-failure e)])
               (catch Exception _ [false "This row could not be applied — re-export and try again."]))]
         (cond
           (not ok?)
           (-> acc
               (update :failed inc)
               (update :rows conj {:row (:row r) :name (:name r) :result "failed"
                                   :productId nil :message res}))
           (= "create" (:action r))
           (-> acc
               (update :created inc)
               (update :rows conj {:row (:row r) :name (:name r) :result "created"
                                   :productId res :message "Created as a draft — add photos and publish"}))
           :else
           (-> acc
               (update :updated inc)
               (update :rows conj {:row (:row r) :name (:name r) :result "updated"
                                   :productId res :message nil}))))

       acc))
   {:created 0 :updated 0 :skipped 0 :failed 0 :rows []}
   plan-rows))

;; --- CSV generation (export + template) -----------------------------

(defn- csv-str [rows]
  (with-open [w (StringWriter.)]
    (csv/write-csv w rows)
    (str w)))

;; --- handlers ------------------------------------------------------

(def ^:private max-bytes (* 2 1024 1024))

;; NOTE: no per-identity rate-limit helper exists in this codebase yet (see the
;; same note in admin/auth.clj). When one lands, wrap `import-preview` with it —
;; the contract asks for a per-admin rate limit on POST /api/admin/products/import.

(defn import-preview [{:keys [multipart-params]}]
  (let [file (get multipart-params "file")]
    (when-not (and file (:tempfile file))
      (throw (err/validation "Attach a CSV file in the \"file\" field.")))
    (when (> (long (or (:size file) 0)) max-bytes)
      (throw (err/validation "That file is over the 2 MB limit.")))
    (let [content (slurp (:tempfile file) :encoding "UTF-8")]
      (db/with-tx [conn]
        (let [{:keys [rows]} (build-plan conn content)
              token (put-plan! (vec (remove #(= "error" (:action %)) rows)))]
          (resp/ok {:token token
                    :summary (summary rows)
                    :rows (mapv public-row rows)}))))))

(def ^:private CommitReq
  [:map [:token [:and v/NonBlank [:re #"^imp_"]]]])

(defn import-commit [{:keys [body-params headers context]}]
  (let [key   (idem/require-key! headers)
        in    (v/validate! CommitReq body-params)
        token (:token in)
        bh    (idem/hash-body body-params)
        prior (db/with-tx [c] (idem/lookup c "product_import_commit" key bh))]
    (if (and prior (:status prior))
      (assoc (resp/ok (:body prior)) :status (:status prior))
      (let [entry (get @plan-cache token)]
        (cond
          (nil? entry)
          (throw (err/ex 404 "import_token_unknown"
                         "That import preview wasn't found. Upload the file again."))

          (expired? entry)
          (do (swap! plan-cache dissoc token)
              (throw (err/ex 410 "import_token_expired"
                             "That import preview has expired. Upload the file again.")))

          (:consumed entry)
          (throw (err/ex 409 "import_token_used"
                         "That import was already applied. Re-export if you need to make more changes."))

          :else
          (let [[old _] (swap-vals! plan-cache update token
                                    (fn [e] (when e (assoc e :consumed true))))]
            (if (get-in old [token :consumed])
              (throw (err/ex 409 "import_token_used"
                             "That import was already applied. Re-export if you need to make more changes."))
              (do
                (db/with-tx [c] (idem/reserve! c "product_import_commit" key bh))
                (let [result (run-commit! (:rows entry) (get-in context [:admin :id]))]
                  (db/with-tx [c] (idem/save-result! c "product_import_commit" key 200 result))
                  (resp/ok result))))))))))

(defn export [_]
  (db/with-tx [conn]
    (let [rows (db/q conn ["select p.name,
                                   p.base_price_amount as \"price\",
                                   coalesce(p.short_description, '') as \"description\",
                                   p.category, p.status,
                                   (select count(*) from product_variants v where v.product_id = p.id) as \"vc\",
                                   (select v.stock from product_variants v where v.product_id = p.id
                                    order by v.created_at limit 1) as \"stock\"
                            from products p
                            where p.status in ('draft','published')
                            order by p.name"])
          out  (into [["name" "price" "description" "quantity" "category" "status"]]
                     (map (fn [r]
                            [(:name r)
                             (str (:price r))
                             (:description r)
                             (if (= 1 (long (:vc r))) (str (:stock r)) "")
                             (:category r)
                             (:status r)])
                          rows))]
      {:status 200
       :headers {"Content-Type" "text/csv; charset=utf-8"
                 "Content-Disposition" (str "attachment; filename=\"house-of-esther-products-"
                                            (u/iso-date) ".csv\"")
                 "Cache-Control" "no-store"}
       :body (csv-str out)})))

(def ^:private template-guidance
  (str "# Fill one row per product. A name that matches an existing product updates it; "
       "a new name creates a DRAFT product (add photos, then publish, from the Products page). "
       "category is required for new products, optional when updating. "
       "price and quantity are whole numbers. Delete these example rows before importing."))

(defn template [_]
  {:status 200
   :headers {"Content-Type" "text/csv; charset=utf-8"
             "Content-Disposition" "attachment; filename=\"house-of-esther-import-template.csv\""
             "Cache-Control" "no-store"}
   :body (str template-guidance "\n"
              (csv-str [["name" "price" "description" "quantity" "category"]
                        ["Orin Linen Dress" "5400"
                         "A compact everyday linen dress in vegetable-washed linen." "8" "women"]
                        ["Harlan Leather Belt" "2200" "" "15" "accessories"]]))})

(def routes
  [["/products/import"          {:post import-preview}]
   ["/products/import/commit"   {:post import-commit}]
   ["/products/import/template" {:get template}]
   ["/products/export"          {:get export}]])
