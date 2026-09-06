(ns house-of-esther.main
  "Entry point."
  (:gen-class)
  (:require [house-of-esther.system :as system]))

(defn -main [& _]
  (system/start!)
  (.addShutdownHook (Runtime/getRuntime) (Thread. ^Runnable system/stop!))
  @(promise))
