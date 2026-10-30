(ns house-of-esther.seed-test
  "SEED_PROFILE tests. The profile/validation test is DB-free; the rest are
   DB-gated (DATABASE_URL) and each run against a throwaway database created
   (and dropped) on the same Postgres server, so no shared database is touched.
   The role in DATABASE_URL needs CREATEDB.

   With a database:  DATABASE_URL=... clojure -X:test"
  (:require [clojure.test :refer [deftest is testing]]
            [buddy.hashers :as hashers]
            [next.jdbc :as jdbc]
            [house-of-esther.config :as config]
            [house-of-esther.db :as db]
            [house-of-esther.migrate :as migrate]
            [house-of-esther.seed :as seed]))

(def ^:private db-url (System/getenv "DATABASE_URL"))

(defn- url-for-db
  "Swap the database name in a jdbc:postgresql:// URL."
  [url dbname]
  (let [[_ pre _ post] (re-matches #"(jdbc:postgresql://[^/]+/)([^?]+)(\?.*)?" url)]
    (str pre dbname post)))

(defn- with-fresh-db
  "Create a throwaway database, migrate it, call (f conn db-url), drop it."
  [f]
  (let [dbname (str "hoe_seed_test_" (System/nanoTime))
        admin  (url-for-db db-url "postgres")
        tmp    (url-for-db db-url dbname)]
    (with-open [c (jdbc/get-connection admin)]
      (jdbc/execute! c [(str "create database " dbname)]))
    (try
      (migrate/migrate! tmp)
      (with-open [c (jdbc/get-connection tmp)]
        (f c))
      (finally
        (with-open [c (jdbc/get-connection admin)]
          (jdbc/execute! c [(str "drop database if exists " dbname " with (force)")]))))))

(defn- cfg [profile]
  (-> (config/load-config)
      (assoc-in [:seed :profile] profile)
      (assoc-in [:seed :admin-password] "seed-test-Password-1")
      (assoc :cdn-base-url "https://cdn.example.test")))

(defn- seed-tx! [conn profile]
  (jdbc/with-transaction [tx conn]
    (seed/seed! tx (cfg profile))))

(defn- n [conn table] (db/one-val conn [(str "select count(*) from " table)]))

(deftest unknown-profile-fails-fast
  (testing "no database needed: rejected before any write"
    (let [e (try (seed/seed! nil (cfg "prod")) nil
                 (catch clojure.lang.ExceptionInfo e e))]
      (is (some? e))
      (is (re-find #"Unknown SEED_PROFILE 'prod'" (ex-message e)))
      (is (re-find #"demo" (ex-message e)))
      (is (re-find #"production" (ex-message e))))))

(deftest default-profile-is-demo-and-password-required
  (is (= "demo" (get-in (config/load-config) [:seed :profile])) "SEED_PROFILE unset -> demo")
  (when db-url
    (with-fresh-db
      (fn [conn]
        (let [e (try (jdbc/with-transaction [tx conn]
                       (seed/seed! tx (assoc-in (cfg "production") [:seed :admin-password] nil)))
                     nil
                     (catch clojure.lang.ExceptionInfo e e))]
          (is (re-find #"SEED_ADMIN_PASSWORD" (ex-message e)))
          (is (zero? (n conn "admin_users")) "rolled back, nothing written"))))))

(deftest production-profile-seeds-only-the-skeleton
  (when db-url
    (with-fresh-db
      (fn [conn]
        (seed-tx! conn "production")
        (testing "no demo content"
          (doseq [t ["products" "product_variants" "collections" "journal_posts"
                     "discounts" "reviews" "orders" "inventory_adjustments"]]
            (is (zero? (n conn t)) t)))
        (testing "exactly the 3 home-page images, URLs derived from CDN_BASE_URL"
          (is (= ["img_cat_accessories" "img_cat_women" "img_hero1"]
                 (mapv :id (db/q conn ["select id from images order by id"]))))
          (is (= "https://cdn.example.test/seed/img_hero1-2000.jpg"
                 (db/one-val conn ["select full_url from images where id = 'img_hero1'"])))
          (is (= [2000 1200] (let [r (db/q1 conn ["select width, height from images where id = 'img_hero1'"])]
                               [(:width r) (:height r)]))))
        (testing "exactly the 7 nav categories, in order, top-level"
          (let [cats (db/q conn ["select slug, label, image_id as \"imageId\", parent_slug as \"parent\"
                                  from categories order by sort_order"])]
            (is (= ["women" "men" "accessories" "watches" "fragrance" "sneakers" "wigs"] (mapv :slug cats)))
            (is (= ["Women" "Men" "Accessories" "Watches" "Fragrance" "Sneakers" "Wigs"] (mapv :label cats)))
            (is (every? nil? (map :parent cats)))
            (is (= {"women" "img_cat_women" "accessories" "img_cat_accessories"}
                   (into {} (keep (fn [c] (when (:imageId c) [(:slug c) (:imageId c)])) cats))))))
        (testing "all delivery methods allow pay-on-delivery; fees/ETAs unchanged"
          (let [ms (db/q conn ["select code, fee_amount as \"fee\", eta, pay_on_delivery_allowed as \"pod\" from delivery_methods order by sort_order, code"])]
            (is (= 3 (count ms)))
            (is (every? :pod ms))
            (is (= {"nairobi_next_day" 300 "town_courier" 450 "upcountry_courier" 650}
                   (into {} (map (juxt :code :fee) ms))))))
        (testing "legal docs present"
          (is (pos? (n conn "legal_documents"))))
        (testing "home content is the minimal launch page"
          (let [h (:data (db/q1 conn ["select data from home_content where id = 1"]))]
            (is (= {:enabled true :text "Delivered countrywide. Pay on delivery." :href "/delivery-returns"}
                   (:announcement h)))
            (is (= "Style worth the wait" (get-in h [:hero :headline])))
            (is (= "img_hero1" (get-in h [:hero :imageId])))
            (is (= ["img_cat_women" "img_cat_accessories"] (mapv :imageId (:categoryTiles h))))
            (is (= [] (:editorialBlocks h)))
            (is (= [] (:socialLinks h)))
            (is (nil? (:featuredCollectionSlug h)))))
        (testing "admin: owner, active, must change password; hash verifies"
          (let [a (db/q1 conn ["select id, role, status, must_change_password as \"must\", password_hash as \"hash\" from admin_users"])]
            (is (= 1 (n conn "admin_users")))
            (is (= "usr_admin1" (:id a)))
            (is (= "owner" (:role a)))
            (is (= "active" (:status a)))
            (is (true? (:must a)))
            (is (:valid (hashers/verify "seed-test-Password-1" (:hash a))))))))))

(deftest production-rerun-never-overwrites-owner-edits
  (when db-url
    (with-fresh-db
      (fn [conn]
        (seed-tx! conn "production")
        ;; the owner changes things
        (db/exec! conn ["update admin_users set password_hash = 'owner-chosen-hash', name = 'Esther Renamed',
                                              must_change_password = false, role = 'owner', status = 'active'
                         where id = 'usr_admin1'"])
        (db/exec! conn ["update home_content set data = jsonb_set(data, '{hero,headline}', '\"Owner headline\"') where id = 1"])
        (db/exec! conn ["update categories set label = 'Ladies' where slug = 'women'"])
        (db/exec! conn ["update delivery_methods set fee_amount = 999, pay_on_delivery_allowed = false where code = 'upcountry_courier'"])
        (db/exec! conn ["update legal_documents set body_html = '<p>owner edit</p>' where doc_type = 'privacy' and version = 3"])
        (db/exec! conn ["update images set alt = 'owner alt' where id = 'img_hero1'"])
        (seed-tx! conn "production")
        (let [a (db/q1 conn ["select name, password_hash as \"hash\", must_change_password as \"must\" from admin_users where id = 'usr_admin1'"])]
          (is (= "owner-chosen-hash" (:hash a)) "password hash untouched")
          (is (= "Esther Renamed" (:name a)))
          (is (false? (:must a)) "must_change_password not re-armed"))
        (is (= "Owner headline"
               (get-in (:data (db/q1 conn ["select data from home_content where id = 1"])) [:hero :headline])))
        (is (= "Ladies" (db/one-val conn ["select label from categories where slug = 'women'"])))
        (is (= [999 false] (let [r (db/q1 conn ["select fee_amount as \"fee\", pay_on_delivery_allowed as \"pod\" from delivery_methods where code = 'upcountry_courier'"])]
                             [(:fee r) (:pod r)])))
        (is (= "<p>owner edit</p>" (db/one-val conn ["select body_html from legal_documents where doc_type = 'privacy' and version = 3"])))
        (is (= "owner alt" (db/one-val conn ["select alt from images where id = 'img_hero1'"])))
        (is (= 1 (n conn "admin_users")))
        (is (= 7 (n conn "categories")))
        (is (= 3 (n conn "images")))))))

(deftest demo-profile-unchanged
  (when db-url
    (with-fresh-db
      (fn [conn]
        (seed-tx! conn "demo")
        (is (= 9 (n conn "products")))
        (is (= 2 (n conn "collections")))
        (is (= 3 (n conn "journal_posts")))
        (is (= 2 (n conn "discounts")))
        (is (= 21 (n conn "images")))
        (is (= 9 (n conn "categories")))
        (is (false? (db/one-val conn ["select pay_on_delivery_allowed from delivery_methods where code = 'upcountry_courier'"]))
            "demo keeps upcountry POD-disallowed")
        (let [h (:data (db/q1 conn ["select data from home_content where id = 1"]))]
          (is (= 2 (count (:editorialBlocks h))))
          (is (= "workwear" (:featuredCollectionSlug h)))
          (is (= "Delivered countrywide. Pay with M-Pesa or on delivery." (get-in h [:announcement :text]))))
        (is (false? (db/one-val conn ["select must_change_password from admin_users where id = 'usr_admin1'"])))
        (testing "re-run still upserts: resets the staging admin password and refreshes images"
          (db/exec! conn ["update admin_users set password_hash = 'x', must_change_password = true where id = 'usr_admin1'"])
          (db/exec! conn ["update images set alt = 'stale' where id = 'img_hero1'"])
          (seed-tx! conn "demo")
          (is (:valid (hashers/verify "seed-test-Password-1"
                                      (db/one-val conn ["select password_hash from admin_users where id = 'usr_admin1'"]))))
          (is (false? (db/one-val conn ["select must_change_password from admin_users where id = 'usr_admin1'"])))
          (is (not= "stale" (db/one-val conn ["select alt from images where id = 'img_hero1'"]))))))))
