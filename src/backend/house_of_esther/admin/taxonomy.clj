(ns house-of-esther.admin.taxonomy
  "A6 — categories & collections."
  (:require [house-of-esther.db :as db]
            [house-of-esther.http.error :as err]
            [house-of-esther.http.response :as resp]
            [house-of-esther.http.validate :as v]))

;; --- categories -------------------------------------------------

(defn list-categories [_]
  (db/with-tx [conn]
    (resp/ok
     {:items (db/q conn ["select c.slug, c.label, c.description, c.image_id as \"imageId\",
                                 c.parent_slug as \"parentSlug\", c.sort_order as \"sortOrder\",
                                 (select count(*) from products p where p.category = c.slug) as \"productCount\"
                          from categories c order by c.sort_order, c.label"])})))

(def ^:private CategoryReq
  [:map
   [:slug v/NonBlank] [:label v/NonBlank]
   [:description {:optional true} [:maybe :string]]
   [:imageId {:optional true} [:maybe :string]]
   [:parentSlug {:optional true} [:maybe :string]]
   [:sortOrder {:optional true} :int]])

(defn create-category [{:keys [body-params]}]
  (let [in (v/validate! CategoryReq body-params)]
    (db/with-tx [conn]
      (when (db/q1 conn ["select 1 from categories where slug = ?" (:slug in)])
        (throw (err/validation "That slug already exists." [{:field "slug" :message "must be unique"}])))
      (db/exec! conn ["insert into categories (slug, label, description, image_id, parent_slug, sort_order)
                       values (?,?,?,?,?,?)"
                      (:slug in) (:label in) (:description in) (:imageId in) (:parentSlug in) (or (:sortOrder in) 0)])
      (resp/created (db/q1 conn ["select slug, label, description, image_id as \"imageId\", parent_slug as \"parentSlug\", sort_order as \"sortOrder\" from categories where slug = ?" (:slug in)])))))

(defn update-category [{:keys [body-params] {:keys [slug]} :path-params}]
  (let [in (v/validate! [:map
                         [:label {:optional true} v/NonBlank]
                         [:description {:optional true} [:maybe :string]]
                         [:imageId {:optional true} [:maybe :string]]
                         [:parentSlug {:optional true} [:maybe :string]]
                         [:sortOrder {:optional true} :int]]
                        body-params)]
    (db/with-tx [conn]
      (when-not (db/q1 conn ["select 1 from categories where slug = ?" slug])
        (throw (err/not-found "Category not found.")))
      (doseq [[k col] {:label "label" :description "description" :imageId "image_id"
                       :parentSlug "parent_slug" :sortOrder "sort_order"}]
        (when (contains? in k)
          (db/exec! conn [(str "update categories set " col " = ? where slug = ?") (get in k) slug])))
      (resp/ok (db/q1 conn ["select slug, label, description, image_id as \"imageId\", parent_slug as \"parentSlug\", sort_order as \"sortOrder\" from categories where slug = ?" slug])))))

(defn delete-category [{{:keys [slug]} :path-params}]
  (db/with-tx [conn]
    (when (db/q1 conn ["select 1 from products where category = ?" slug])
      (throw (err/conflict "conflict" "Move or archive its products first." nil)))
    (db/exec! conn ["delete from categories where slug = ?" slug])
    resp/no-content))

;; --- collections ----------------------------------------------

(defn- collection-out [c]
  {:slug (:slug c) :title (:title c) :description (:description c)
   :heroImageId (:heroImageId c) :rule (:rule c)})

(defn list-collections [_]
  (db/with-tx [conn]
    (resp/ok {:items (mapv collection-out
                           (db/q conn ["select slug, title, description, hero_image_id as \"heroImageId\", rule
                                        from collections order by created_at"]))})))

(def ^:private CollectionReq
  [:map
   [:slug v/NonBlank] [:title v/NonBlank]
   [:description {:optional true} [:maybe :string]]
   [:heroImageId {:optional true} [:maybe :string]]
   [:rule [:map [:type [:enum "manual" "auto_new_arrivals" "auto_sale"]]
           [:productIds {:optional true} [:vector :string]]
           [:days {:optional true} :int]]]])

(defn create-collection [{:keys [body-params]}]
  (let [in (v/validate! CollectionReq body-params)]
    (db/with-tx [conn]
      (when (db/q1 conn ["select 1 from collections where slug = ?" (:slug in)])
        (throw (err/validation "That slug already exists." [{:field "slug" :message "must be unique"}])))
      (db/exec! conn ["insert into collections (slug, title, description, hero_image_id, rule) values (?,?,?,?,?)"
                      (:slug in) (:title in) (:description in) (:heroImageId in) (:rule in)])
      (resp/created (collection-out (db/q1 conn ["select slug, title, description, hero_image_id as \"heroImageId\", rule from collections where slug = ?" (:slug in)]))))))

(defn update-collection [{:keys [body-params] {:keys [slug]} :path-params}]
  (let [in (v/validate! [:map
                         [:title {:optional true} v/NonBlank]
                         [:description {:optional true} [:maybe :string]]
                         [:heroImageId {:optional true} [:maybe :string]]
                         [:rule {:optional true} [:map]]]
                        body-params)]
    (db/with-tx [conn]
      (when-not (db/q1 conn ["select 1 from collections where slug = ?" slug])
        (throw (err/not-found "Collection not found.")))
      (doseq [[k col] {:title "title" :description "description" :heroImageId "hero_image_id" :rule "rule"}]
        (when (contains? in k)
          (db/exec! conn [(str "update collections set " col " = ?, updated_at = now() where slug = ?") (get in k) slug])))
      (resp/ok (collection-out (db/q1 conn ["select slug, title, description, hero_image_id as \"heroImageId\", rule from collections where slug = ?" slug]))))))

(defn delete-collection [{{:keys [slug]} :path-params}]
  (db/with-tx [conn]
    (db/exec! conn ["delete from collections where slug = ?" slug])
    resp/no-content))

(def routes
  [["/categories" {:get list-categories :post create-category}]
   ["/categories/:slug" {:patch update-category :delete delete-category}]
   ["/collections" {:get list-collections :post create-collection}]
   ["/collections/:slug" {:patch update-collection :delete delete-collection}]])
