(ns house-of-esther.system
  "Start / stop the whole service: config -> db pool -> migrations -> HTTP."
  (:require [clojure.tools.logging :as log]
            [house-of-esther.obs :as obs]
            [ring.adapter.jetty :as jetty]
            [house-of-esther.config :as config]
            [house-of-esther.db :as db]
            [house-of-esther.migrate :as migrate]
            [house-of-esther.router :as router]
            [house-of-esther.runtime :as runtime]))

(defonce ^:private system (atom nil))

(defn start!
  ([] (start! (config/load-config)))
  ([cfg]
   (obs/infow "starting" :port (:port cfg))
   (runtime/set-config! cfg)
   (db/start-pool! cfg)
   (when (:run-migrations? cfg)
     (migrate/migrate! (:database-url cfg)))
   (let [server (jetty/run-jetty (router/handler cfg)
                                 {:port (:port cfg) :join? false})]
     (reset! system {:server server :config cfg})
     (obs/infow "started" :port (:port cfg))
     @system)))

(defn stop! []
  (when-let [{:keys [server]} @system]
    (.stop server)
    (db/stop-pool!)
    (reset! system nil)
    (log/info "stopped")))
