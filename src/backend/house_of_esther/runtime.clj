(ns house-of-esther.runtime
  "Holds the loaded config for code paths that shouldn't thread it through
   every call (e.g. the M-Pesa proxy). Set once at system start.")

(defonce ^:private state (atom {}))

(defn set-config! [cfg] (reset! state cfg))

(defn config
  ([] @state)
  ([& ks] (get-in @state ks)))
