(ns house-of-esther.obs
  "Thin structured-logging helpers over clojure.tools.logging: an event name
   plus key/value context, rendered as `event {:k v ...}` so logs carry real
   context rather than scattered prints."
  (:require [clojure.tools.logging :as log]))

(defn- ctx [kv] (pr-str (apply array-map kv)))

(defn infow [event & kv] (log/info event (ctx kv)))
(defn warnw [event & kv] (log/warn event (ctx kv)))
(defn errorw [event & kv] (log/error event (ctx kv)))
