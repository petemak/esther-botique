(ns house-of-esther.db
  "Database access. One Postgres database, one HikariCP pool.
   Result columns (snake_case) are surfaced as camelCase keys so feature code
   speaks the same vocabulary as the API contract. jsonb columns are read and
   written as Clojure data."
  (:require [jsonista.core :as j]
            [next.jdbc :as jdbc]
            [next.jdbc.connection :as connection]
            [next.jdbc.prepare :as prepare]
            [next.jdbc.result-set :as rs]
            [house-of-esther.util :as u])
  (:import [com.zaxxer.hikari HikariDataSource]
           [org.postgresql.util PGobject]))

(defonce ^:private datasource (atom nil))

(defn start-pool!
  [{:keys [database-url db-pool-size]}]
  (let [ds (connection/->pool HikariDataSource
                              {:jdbcUrl     database-url
                               :maximumPoolSize (or db-pool-size 8)
                               :poolName    "house-of-esther"})]
    ;; force a connection so misconfiguration fails fast at startup
    (.close (jdbc/get-connection ds))
    (reset! datasource ds)
    ds))

(defn stop-pool! []
  (when-let [^HikariDataSource ds @datasource]
    (.close ds)
    (reset! datasource nil)))

(defn ds []
  (or @datasource
      (throw (ex-info "Database pool not started" {}))))

(defn set-datasource! [ds] (reset! datasource ds))

;; --- jsonb <-> Clojure data -------------------------------------------------

(def ^:private mapper (j/object-mapper {:decode-key-fn keyword}))

(defn ->jsonb [x]
  (doto (PGobject.)
    (.setType "jsonb")
    (.setValue (j/write-value-as-string x mapper))))

(extend-protocol rs/ReadableColumn
  PGobject
  (read-column-by-label [^PGobject v _]
    (let [t (.getType v)]
      (if (#{"json" "jsonb"} t)
        (some-> (.getValue v) (j/read-value mapper))
        (.getValue v))))
  (read-column-by-index [^PGobject v _ _]
    (let [t (.getType v)]
      (if (#{"json" "jsonb"} t)
        (some-> (.getValue v) (j/read-value mapper))
        (.getValue v)))))

(extend-protocol prepare/SettableParameter
  clojure.lang.IPersistentMap
  (set-parameter [m ^java.sql.PreparedStatement s i] (.setObject s i (->jsonb m)))
  clojure.lang.IPersistentVector
  (set-parameter [v ^java.sql.PreparedStatement s i] (.setObject s i (->jsonb v))))

;; --- result-set shaping ----------------------------------------------------

(defn- camel-builder [rs opts]
  (rs/as-unqualified-modified-maps
   rs (assoc opts :label-fn u/->camel :qualifier-fn (constantly nil))))

(def ^:private opts {:builder-fn camel-builder})

;; --- query helpers -------------------------------------------------------

(defn q
  "Run a query, return a vector of camelCase-keyed maps."
  ([sqlvec] (q (ds) sqlvec))
  ([conn sqlvec] (jdbc/execute! conn sqlvec opts)))

(defn q1
  "Run a query, return the first row or nil."
  ([sqlvec] (q1 (ds) sqlvec))
  ([conn sqlvec] (jdbc/execute-one! conn sqlvec opts)))

(defn exec!
  "Run a statement, return the update result."
  ([sqlvec] (exec! (ds) sqlvec))
  ([conn sqlvec] (jdbc/execute-one! conn sqlvec {})))

(defn one-val
  "Run a query expected to yield a single scalar; return it."
  ([sqlvec] (one-val (ds) sqlvec))
  ([conn sqlvec]
   (let [row (jdbc/execute-one! conn sqlvec {:builder-fn rs/as-arrays})]
     (when row (first row)))))

(defmacro with-tx
  "Run body with `sym` bound to a transactional connection."
  [[sym] & body]
  `(jdbc/with-transaction [~sym (ds)]
     ~@body))
