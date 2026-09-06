(ns hooks.with-tx
  (:require [clj-kondo.hooks-api :as api]))

(defn with-tx
  "Rewrite (with-tx [conn] body...) => (let [conn nil] body...) for analysis."
  [{:keys [node]}]
  (let [[binding-vec & body] (rest (:children node))
        sym (first (:children binding-vec))
        new-node (api/list-node
                  (list*
                   (api/token-node 'let)
                   (api/vector-node [sym (api/token-node nil)])
                   body))]
    {:node new-node}))
