(ns house-of-esther.admin.inventory
  "A5 — inventory list + stock adjustments (audit-trailed). Crossing 0 -> positive
   enqueues back-in-stock alerts for confirmed subscribers."
  (:require [clojure.string :as str]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.page :as page]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]
            [house-of-esther.notify :as notify]
            [house-of-esther.present :as present]
            [house-of-esther.util :as u]))

(defn- stock-filter [stock]
  (case stock
    "out" "v.stock <= 0"
    "low" "v.stock > 0 and v.stock <= v.low_stock_threshold"
    "in"  "v.stock > v.low_stock_threshold"
    "1=1"))

(defn list-inventory [{:keys [query-params]}]
  (db/with-tx [conn]
    (let [pg    (page/params query-params)
          qterm (not-empty (get query-params "q"))
          where (cond-> [(stock-filter (get query-params "stock"))]
                  qterm (conj "(p.name ilike ? or v.sku ilike ?)"))
          args  (if qterm [(str "%" qterm "%") (str "%" qterm "%")] [])
          w     (str/join " and " where)
          total (or (db/one-val conn (into [(str "select count(*) from product_variants v join products p on p.id = v.product_id where " w)] args)) 0)
          rows  (db/q conn (into [(str "select v.id as \"variantId\", v.sku, v.options, v.stock,
                                               v.low_stock_threshold as \"lowStockThreshold\", v.enabled,
                                               p.id as \"productId\", p.name as \"productName\"
                                        from product_variants v join products p on p.id = v.product_id
                                        where " w " order by p.name, v.sku limit ? offset ?")]
                                 (concat args [(:page-size pg) (:offset pg)])))]
      (resp/ok (page/wrap
                (mapv (fn [r]
                        {:productId (:productId r) :productName (:productName r)
                         :variantId (:variantId r) :sku (:sku r) :options (:options r)
                         :stock (:stock r) :lowStockThreshold (:lowStockThreshold r)
                         :stockState (present/stock-state r)})
                      rows)
                pg total)))))

;; NOTE (A17): the DB CHECK constraint on `reason` also allows 'bulk_import',
;; but that value is written ONLY by the product import-commit path
;; (house-of-esther.admin.product-import). This endpoint's malli enum stays at
;; the original four — POST /api/admin/inventory/adjustments must not accept it.
(def ^:private AdjReq
  [:map
   [:variantId v/NonBlank]
   [:delta :int]
   [:reason [:enum "restock" "correction" "damage" "return_to_stock"]]
   [:note {:optional true} [:maybe :string]]])

(defn apply-adjustment!
  "Write one audited stock change on `conn` (caller owns the transaction):
   lock the variant, move stock by `delta`, insert the inventory_adjustments
   row, and enqueue back-in-stock alerts when stock crosses 0 -> positive.
   Returns {:id :variantId :delta :reason :resultingStock :createdBy}.
   Throws err/not-found (unknown variant) or err/validation (would go negative)."
  [conn {:keys [variant-id delta reason note admin-id]}]
  (let [v-row (db/q1 conn ["select id, stock from product_variants where id = ? for update" variant-id])]
    (when-not v-row (throw (err/not-found "Variant not found.")))
    (let [before (long (:stock v-row))
          after  (+ before (long delta))]
      (when (neg? after)
        (throw (err/validation "That adjustment would take stock below zero."
                               [{:field "delta" :message "resulting stock negative"}])))
      (db/exec! conn ["update product_variants set stock = ? where id = ?" after variant-id])
      (let [id (u/prefixed-id "adj")]
        (db/exec! conn ["insert into inventory_adjustments (id, variant_id, delta, reason, note, resulting_stock, created_by)
                         values (?,?,?,?,?,?,?)"
                        id variant-id delta reason note after admin-id])
        (when (and (<= before 0) (pos? after))
          (doseq [s (db/q conn ["select id, email from subscribers
                                 where variant_id = ? and status = 'confirmed' and back_in_stock = true" variant-id])]
            (notify/enqueue! conn :back-in-stock {:email (:email s) :variantId variant-id})))
        {:id id :variantId variant-id :delta delta :reason reason
         :resultingStock after :createdBy admin-id}))))

(defn create-adjustment [{:keys [body-params context]}]
  (let [in (v/validate! AdjReq body-params)]
    (db/with-tx [conn]
      (let [res (apply-adjustment! conn {:variant-id (:variantId in)
                                         :delta (:delta in)
                                         :reason (:reason in)
                                         :note (:note in)
                                         :admin-id (get-in context [:admin :id])})]
        (resp/created (assoc res :createdAt (u/iso)))))))

(defn list-adjustments [{:keys [query-params]}]
  (db/with-tx [conn]
    (let [pg  (page/params query-params)
          vid (not-empty (get query-params "variantId"))
          where (if vid "variant_id = ?" "1=1")
          args  (if vid [vid] [])
          total (or (db/one-val conn (into [(str "select count(*) from inventory_adjustments where " where)] args)) 0)
          rows (db/q conn (into [(str "select id, variant_id as \"variantId\", delta, reason, note,
                                              resulting_stock as \"resultingStock\", created_by as \"createdBy\", created_at as \"createdAt\"
                                       from inventory_adjustments where " where " order by created_at desc limit ? offset ?")]
                                (concat args [(:page-size pg) (:offset pg)])))]
      (resp/ok (page/wrap (mapv #(update % :createdAt (fn [t] (some-> t .toInstant u/iso))) rows) pg total)))))

(def routes
  [["/inventory" {:get list-inventory}]
   ["/inventory/adjustments" {:get list-adjustments :post create-adjustment}]])
