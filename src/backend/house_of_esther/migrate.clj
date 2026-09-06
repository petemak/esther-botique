(ns house-of-esther.migrate
  "Versioned migrations (migratus). Schema changes go through numbered files in
   resources/migrations — never ad hoc DDL."
  (:require [clojure.tools.logging :as log]
            [migratus.core :as migratus]
            [house-of-esther.config :as config]))

(defn migratus-config [database-url]
  {:store         :database
   :migration-dir "migrations"
   :db            {:connection-uri database-url}})

(defn migrate!
  ([] (migrate! (:database-url (config/load-config))))
  ([database-url]
   (log/info "Running database migrations")
   (migratus/migrate (migratus-config database-url))
   (log/info "Migrations complete")))

(defn rollback! [database-url]
  (migratus/rollback (migratus-config database-url)))

(defn -main [& _]
  (migrate!)
  (shutdown-agents))
