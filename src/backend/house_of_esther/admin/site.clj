(ns house-of-esther.admin.site
  "A12 home content, A13 legal documents, A14 discounts."
  (:require [clojure.string :as str]
            [house-of-esther.content :as content]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.legal :as legal]
            [house-of-esther.money :as money]
            [house-of-esther.util :as u]))

;; --- A12 home content --------------------------------------

(defn get-home [_]
  (db/with-tx [conn]
    (resp/ok (content/raw-content conn))))

(def ^:private HomeReq
  [:map
   [:announcement [:map [:enabled :boolean] [:text :string] [:href {:optional true} [:maybe :string]]]]
   [:hero [:map [:headline :string] [:subcopy :string] [:ctaLabel :string] [:ctaHref :string]
           [:imageId {:optional true} [:maybe :string]]]]
   [:categoryTiles [:vector [:map [:label :string] [:href :string] [:imageId {:optional true} [:maybe :string]]]]]
   [:editorialBlocks [:vector [:map [:id :string] [:caption :string] [:href :string] [:imageId {:optional true} [:maybe :string]]]]]
   [:featuredCollectionSlug {:optional true} [:maybe :string]]
   [:socialLinks [:vector [:map [:platform :string] [:url :string]]]]])

(defn put-home [{:keys [body-params]}]
  (let [in (v/validate! HomeReq body-params)]
    (db/with-tx [conn]
      (db/exec! conn ["insert into home_content (id, data) values (1, ?)
                       on conflict (id) do update set data = excluded.data" in])
      (resp/ok in))))

;; --- A13 legal --------------------------------------------

(defn list-legal [_]
  (db/with-tx [conn]
    (resp/ok
     {:items (db/q conn ["select doc_type as \"docType\", max(version) as \"currentVersion\",
                                 max(effective_date) as \"effectiveDate\", max(created_at) as \"updatedAt\"
                          from legal_documents group by doc_type"])})))

(defn get-legal [{{:keys [docType]} :path-params}]
  (when-not (legal/doc-types docType) (throw (err/not-found "Unknown document.")))
  (db/with-tx [conn]
    (let [versions (db/q conn ["select version, effective_date as \"effectiveDate\", title, created_at as \"createdAt\"
                                from legal_documents where doc_type = ? order by version desc" docType])
          current  (first versions)]
      (resp/ok {:docType docType
                :currentVersion (:version current)
                :title (:title current)
                :bodyHtml (:bodyHtml (db/q1 conn ["select body_html as \"bodyHtml\" from legal_documents where doc_type = ? and version = ?"
                                                  docType (:version current)]))
                :versions (mapv #(-> % (update :effectiveDate str)
                                     (update :createdAt (fn [t] (some-> t .toInstant u/iso))))
                                versions)}))))

(def ^:private LegalVersionReq
  [:map [:bodyHtml v/NonBlank] [:effectiveDate v/NonBlank] [:title v/NonBlank]])

(defn create-legal-version [{{:keys [docType]} :path-params :keys [body-params]}]
  (when-not (legal/doc-types docType) (throw (err/not-found "Unknown document.")))
  (let [in (v/validate! LegalVersionReq body-params)]
    (db/with-tx [conn]
      (let [next-v (inc (or (legal/current-version conn docType) 0))]
        (db/exec! conn ["insert into legal_documents (doc_type, version, effective_date, title, body_html)
                         values (?,?,?::date,?,?)"
                        docType next-v (:effectiveDate in) (:title in) (:bodyHtml in)])
        (resp/created {:docType docType :version next-v :effectiveDate (:effectiveDate in)})))))

;; --- A14 discounts ---------------------------------------

(defn- discount-out [d]
  {:code (:code d) :type (:type d) :value (:value d)
   :minSpend (some-> (:minSpendAmount d) money/kes)
   :usageLimitTotal (:usageLimitTotal d)
   :usageLimitPerCustomer (:usageLimitPerCustomer d)
   :eligibleCategories (:eligibleCategories d)
   :startsAt (some-> (:startsAt d) .toInstant u/iso)
   :endsAt (some-> (:endsAt d) .toInstant u/iso)
   :active (boolean (:active d))
   :timesUsed (:timesUsed d)})

(def ^:private disc-cols
  "code, type, value, min_spend_amount as \"minSpendAmount\", usage_limit_total as \"usageLimitTotal\",
   usage_limit_per_customer as \"usageLimitPerCustomer\", eligible_categories as \"eligibleCategories\",
   starts_at as \"startsAt\", ends_at as \"endsAt\", active, times_used as \"timesUsed\"")

(defn list-discounts [_]
  (db/with-tx [conn]
    (resp/ok {:items (mapv discount-out (db/q conn [(str "select " disc-cols " from discounts order by created_at desc")]))})))

(def ^:private DiscountReq
  [:map
   [:code v/NonBlank]
   [:type [:enum "percent" "fixed" "free_delivery"]]
   [:value {:optional true} number?]
   [:minSpend {:optional true} [:maybe v/Money]]
   [:usageLimitTotal {:optional true} [:maybe :int]]
   [:usageLimitPerCustomer {:optional true} [:maybe :int]]
   [:eligibleCategories {:optional true} [:vector :string]]
   [:startsAt {:optional true} [:maybe :string]]
   [:endsAt {:optional true} [:maybe :string]]
   [:active {:optional true} :boolean]])

(defn create-discount [{:keys [body-params]}]
  (let [in (v/validate! DiscountReq body-params)
        code (str/upper-case (:code in))]
    (db/with-tx [conn]
      (when (db/q1 conn ["select 1 from discounts where code = ?" code])
        (throw (err/validation "That code already exists." [{:field "code" :message "must be unique"}])))
      (db/exec! conn ["insert into discounts (code, type, value, min_spend_amount, usage_limit_total, usage_limit_per_customer,
                                              eligible_categories, starts_at, ends_at, active)
                       values (?,?,?,?,?,?,?,?::timestamptz,?::timestamptz,?)"
                      code (:type in) (or (:value in) 0) (some-> (:minSpend in) money/amount)
                      (:usageLimitTotal in) (:usageLimitPerCustomer in)
                      (vec (or (:eligibleCategories in) [])) (:startsAt in) (:endsAt in)
                      (if (contains? in :active) (:active in) true)])
      (resp/created (discount-out (db/q1 conn [(str "select " disc-cols " from discounts where code = ?") code]))))))

(defn update-discount [{:keys [body-params] {:keys [code]} :path-params}]
  (let [in (v/validate! [:map
                         [:type {:optional true} [:enum "percent" "fixed" "free_delivery"]]
                         [:value {:optional true} number?]
                         [:minSpend {:optional true} [:maybe v/Money]]
                         [:usageLimitTotal {:optional true} [:maybe :int]]
                         [:usageLimitPerCustomer {:optional true} [:maybe :int]]
                         [:eligibleCategories {:optional true} [:vector :string]]
                         [:startsAt {:optional true} [:maybe :string]]
                         [:endsAt {:optional true} [:maybe :string]]
                         [:active {:optional true} :boolean]]
                        body-params)]
    (db/with-tx [conn]
      (when-not (db/q1 conn ["select 1 from discounts where code = ?" code])
        (throw (err/not-found "Discount not found.")))
      (doseq [[k col] {:type "type" :value "value" :usageLimitTotal "usage_limit_total"
                       :usageLimitPerCustomer "usage_limit_per_customer" :eligibleCategories "eligible_categories"}]
        (when (contains? in k)
          (db/exec! conn [(str "update discounts set " col " = ? where code = ?") (get in k) code])))
      (when (contains? in :minSpend)
        (db/exec! conn ["update discounts set min_spend_amount = ? where code = ?" (some-> (:minSpend in) money/amount) code]))
      (when (contains? in :active)
        (db/exec! conn ["update discounts set active = ? where code = ?" (boolean (:active in)) code]))
      (when (contains? in :startsAt)
        (db/exec! conn ["update discounts set starts_at = ?::timestamptz where code = ?" (:startsAt in) code]))
      (when (contains? in :endsAt)
        (db/exec! conn ["update discounts set ends_at = ?::timestamptz where code = ?" (:endsAt in) code]))
      (resp/ok (discount-out (db/q1 conn [(str "select " disc-cols " from discounts where code = ?") code]))))))

(defn delete-discount [{{:keys [code]} :path-params}]
  (db/with-tx [conn]
    (db/exec! conn ["delete from discounts where code = ?" code])
    resp/no-content))

(def routes
  [["/content/home" {:get get-home :put put-home}]
   ["/legal" {:get list-legal}]
   ["/legal/:docType" {:get get-legal}]
   ["/legal/:docType/versions" {:post create-legal-version}]
   ["/discounts" {:get list-discounts :post create-discount}]
   ["/discounts/:code" {:patch update-discount :delete delete-discount}]])
