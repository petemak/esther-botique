(ns house-of-esther.content
  "D1 — home page content. Stored as an editable form keyed by imageId;
   the public read resolves those to ImageRefs."
  (:require [house-of-esther.catalog :as catalog]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.present :as present]))

(defn raw-content [conn]
  (or (:data (db/q1 conn ["select data from home_content where id = 1"]))
      {:announcement {:enabled false :text "" :href nil}
       :hero {:headline "" :subcopy "" :ctaLabel "" :ctaHref "/" :imageId nil}
       :categoryTiles [] :editorialBlocks []
       :featuredCollectionSlug nil :socialLinks []}))

(defn- collect-image-ids [c]
  (->> (concat [(get-in c [:hero :imageId])]
               (map :imageId (:categoryTiles c))
               (map :imageId (:editorialBlocks c)))
       (remove nil?)))

(defn resolve-content [conn c]
  (let [imgs (catalog/images-by-id conn (collect-image-ids c))]
    {:announcement (:announcement c)
     :hero (-> (:hero c)
               (dissoc :imageId)
               (assoc :image (present/img-full (get imgs (get-in c [:hero :imageId])))))
     :categoryTiles (mapv (fn [t]
                            {:label (:label t) :href (:href t)
                             :image (present/img-thumb (get imgs (:imageId t)))})
                          (:categoryTiles c))
     :editorialBlocks (mapv (fn [b]
                              {:id (:id b) :caption (:caption b) :href (:href b)
                               :image (present/img-full (get imgs (:imageId b)))})
                            (:editorialBlocks c))
     :featuredCollectionSlug (:featuredCollectionSlug c)
     :socialLinks (:socialLinks c)}))

(defn get-home [_]
  (db/with-tx [conn]
    (let [c (raw-content conn)]
      (when (empty? (:categoryTiles c))
        (throw (err/not-found "Home content hasn't been set up yet.")))
      (resp/ok (resolve-content conn c) resp/cache-catalog))))

(def routes
  [["/content/home" {:get get-home}]])
