(ns house-of-esther.runtime
  "Holds the loaded config for code paths that shouldn't thread it through
   every call (e.g. the M-Pesa proxy). Set once at system start.")

(defonce ^:private state (atom {}))

(defn set-config! [cfg] (reset! state cfg))

(defn config
  ([] @state)
  ([& ks] (get-in @state ks)))

(defn mpesa-online?
  "True unless MPESA_ONLINE_ENABLED turned online M-Pesa off. An absent key
   (e.g. a bare test config) means enabled — the documented default."
  []
  (not (false? (config :mpesa-online-enabled?))))
