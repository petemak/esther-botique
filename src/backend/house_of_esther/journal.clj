(ns house-of-esther.journal
  "D28 — journal."
  (:require [house-of-esther.catalog :as catalog]
            [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.page :as page]
            [house-of-esther.http.response :as resp]
            [house-of-esther.present :as present]
            [house-of-esther.util :as u]))

(defn- card [post images]
  {:slug (:slug post)
   :title (:title post)
   :excerpt (:excerpt post)
   :tag (:tag post)
   :coverImage (present/img-thumb (get images (:coverImageId post)))
   :publishedAt (some-> (:publishedAt post) .toInstant u/iso)})

(defn list-posts [{:keys [query-params]}]
  (db/with-tx [conn]
    (let [pg  (page/params query-params {:default 12 :max 48})
          tag (not-empty (get query-params "tag"))
          where (if tag "status = 'published' and tag = ?" "status = 'published'")
          args  (if tag [tag] [])
          total (or (db/one-val conn (into [(str "select count(*) from journal_posts where " where)] args)) 0)
          rows  (db/q conn (into [(str "select slug, title, excerpt, tag, cover_image_id as \"coverImageId\", published_at as \"publishedAt\"
                                        from journal_posts where " where " order by published_at desc limit ? offset ?")]
                                 (concat args [(:page-size pg) (:offset pg)])))
          imgs  (catalog/images-by-id conn (map :coverImageId rows))]
      (resp/ok (page/wrap (mapv #(card % imgs) rows) pg total) resp/cache-catalog))))

(defn get-post [{{:keys [slug]} :path-params}]
  (db/with-tx [conn]
    (let [p (db/q1 conn ["select slug, title, tag, hero_image_id as \"heroImageId\", body_html as \"bodyHtml\",
                                 shop_the_look_ids as \"shopTheLookIds\", related_slugs as \"relatedSlugs\",
                                 seo, published_at as \"publishedAt\"
                          from journal_posts where slug = ? and status = 'published'" slug])]
      (when-not p (throw (err/not-found "That story isn't published.")))
      (let [hero (get (catalog/images-by-id conn [(:heroImageId p)]) (:heroImageId p))
            shop (when (seq (:shopTheLookIds p))
                   (catalog/hydrate-cards conn
                                          (db/q conn [(str "select " catalog/product-cols
                                                           " from products p where p.id = any(?) and p.status = 'published'")
                                                      (into-array String (:shopTheLookIds p))])))
            related (db/q conn ["select slug, title, cover_image_id as \"coverImageId\", published_at as \"publishedAt\"
                                 from journal_posts where slug = any(?) and status = 'published'"
                                (into-array String (or (:relatedSlugs p) []))])
            rimgs (catalog/images-by-id conn (map :coverImageId related))]
        (resp/ok
         {:slug (:slug p)
          :title (:title p)
          :tag (:tag p)
          :heroImage (present/img-full hero)
          :publishedAt (some-> (:publishedAt p) .toInstant u/iso)
          :bodyHtml (:bodyHtml p)
          :shopTheLook (vec shop)
          :related (mapv (fn [r]
                           {:slug (:slug r) :title (:title r)
                            :coverImage (present/img-thumb (get rimgs (:coverImageId r)))
                            :publishedAt (some-> (:publishedAt r) .toInstant u/iso)})
                         related)
          :seo (:seo p)}
         resp/cache-catalog)))))

(def routes
  [["/journal" {:get list-posts}]
   ["/journal/:slug" {:get get-post}]])
