(ns house-of-esther.legal
  "D27 — legal documents. Historical versions stay fetchable so old
   agreementAcceptance records remain resolvable."
  (:require [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.util :as u]))

(def doc-types #{"terms-of-sale" "privacy" "returns"})

(defn current-version [conn doc-type]
  (db/one-val conn ["select max(version) from legal_documents where doc_type = ?" doc-type]))

(defn published-versions
  "The version numbers checkout currently requires acceptance of."
  [conn]
  {:termsOfSale (current-version conn "terms-of-sale")
   :returns     (current-version conn "returns")})

(defn- row->doc [row]
  {:docType (:docType row)
   :version (:version row)
   :effectiveDate (str (:effectiveDate row))
   :title (:title row)
   :bodyHtml (:bodyHtml row)})

(defn- fetch [conn doc-type version]
  (db/q1 conn ["select doc_type as \"docType\", version, effective_date as \"effectiveDate\", title, body_html as \"bodyHtml\"
                from legal_documents where doc_type = ? and version = ?" doc-type version]))

(defn get-current [{{:keys [docType]} :path-params}]
  (when-not (doc-types docType) (throw (err/not-found "Unknown document.")))
  (db/with-tx [conn]
    (let [v (current-version conn docType)]
      (when-not v (throw (err/not-found "That document isn't published yet.")))
      (let [doc (fetch conn docType v)
            prev (db/q conn ["select version, effective_date as \"effectiveDate\"
                              from legal_documents where doc_type = ? and version < ? order by version desc"
                             docType v])]
        (resp/ok (assoc (row->doc doc)
                        :previousVersions (mapv #(update % :effectiveDate str) prev))
                 resp/cache-catalog)))))

(defn get-version [{{:keys [docType version]} :path-params}]
  (when-not (doc-types docType) (throw (err/not-found "Unknown document.")))
  (db/with-tx [conn]
    (let [doc (fetch conn docType (u/parse-long* version))]
      (when-not doc (throw (err/not-found "That version doesn't exist.")))
      (resp/ok (row->doc doc) resp/cache-catalog))))

(def routes
  [["/legal/:docType" {:get get-current}]
   ["/legal/:docType/versions/:version" {:get get-version}]])
