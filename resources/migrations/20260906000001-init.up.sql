-- House of Esther initial schema.
-- One Postgres database. All timestamps are timestamptz (UTC).
-- migratus runs one statement per --;; block.
create table images (
  id           text primary key,
  alt          text not null default '',
  thumb_url    text not null,
  full_url     text not null,
  width        integer not null default 0,
  height       integer not null default 0,
  thumb_bytes  integer not null default 0,
  full_bytes   integer not null default 0,
  created_at   timestamptz not null default now()
);
--;;
create table users (
  id             text primary key,
  first_name     text not null,
  last_name      text,
  email          text not null unique,
  phone          text,
  password_hash  text not null,
  marketing_opt_in boolean not null default false,
  new_arrivals   boolean not null default true,
  back_in_stock  boolean not null default true,
  journal        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
--;;
create table admin_users (
  id             text primary key,
  name           text not null,
  email          text not null unique,
  password_hash  text not null,
  role           text not null default 'admin',
  created_at     timestamptz not null default now()
);
--;;
create table sessions (
  id          text primary key,
  kind        text not null check (kind in ('customer','admin')),
  user_id     text not null,
  csrf_token  text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
--;;
create index sessions_expires_idx on sessions (expires_at);
--;;
create table password_reset_tokens (
  token      text primary key,
  user_id    text not null references users(id),
  expires_at timestamptz not null,
  used_at    timestamptz
);
--;;
create table categories (
  slug         text primary key,
  label        text not null,
  description  text,
  image_id     text references images(id),
  parent_slug  text,
  sort_order   integer not null default 0
);
--;;
create table collections (
  slug          text primary key,
  title         text not null,
  description   text,
  hero_image_id text references images(id),
  rule          jsonb not null default '{"type":"manual","productIds":[]}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
--;;
create table products (
  id                 text primary key,
  slug               text not null unique,
  name               text not null,
  category           text not null,
  subcategory        text,
  short_description  text,
  story              text,
  care               text,
  specs              jsonb not null default '[]'::jsonb,
  base_price_amount  bigint not null,
  compare_at_amount  bigint,
  currency           text not null default 'KES',
  cost_price_amount  bigint,
  vat_inclusive      boolean not null default true,
  option_axes        jsonb not null default '[]'::jsonb,
  image_ids          jsonb not null default '[]'::jsonb,
  primary_image_id   text,
  size_guide_category text,
  seo                jsonb not null default '{}'::jsonb,
  status             text not null default 'draft' check (status in ('draft','published','archived')),
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
--;;
create index products_status_idx on products (status);
--;;
create index products_category_idx on products (category);
--;;
create table product_variants (
  id                  text primary key,
  product_id          text not null references products(id),
  sku                 text not null unique,
  options             jsonb not null default '{}'::jsonb,
  price_amount        bigint not null,
  compare_at_amount   bigint,
  stock               integer not null default 0,
  low_stock_threshold integer not null default 2,
  image_id            text,
  enabled             boolean not null default true,
  created_at          timestamptz not null default now()
);
--;;
create index variants_product_idx on product_variants (product_id);
--;;
create table inventory_adjustments (
  id              text primary key,
  variant_id      text not null references product_variants(id),
  delta           integer not null,
  reason          text not null check (reason in ('restock','correction','damage','return_to_stock')),
  note            text,
  resulting_stock integer not null,
  created_by      text,
  created_at      timestamptz not null default now()
);
--;;
create index adjustments_variant_idx on inventory_adjustments (variant_id, created_at desc);
--;;
create table discounts (
  code                     text primary key,
  type                     text not null check (type in ('percent','fixed','free_delivery')),
  value                    numeric not null default 0,
  min_spend_amount         bigint,
  usage_limit_total        integer,
  usage_limit_per_customer integer,
  eligible_categories      jsonb not null default '[]'::jsonb,
  starts_at                timestamptz,
  ends_at                  timestamptz,
  active                   boolean not null default true,
  times_used               integer not null default 0,
  created_at               timestamptz not null default now()
);
--;;
create table carts (
  id            text primary key,
  user_id       text references users(id),
  discount_code text references discounts(code),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
--;;
create unique index carts_user_idx on carts (user_id) where user_id is not null;
--;;
create table cart_items (
  id         text primary key,
  cart_id    text not null references carts(id) on delete cascade,
  variant_id text not null references product_variants(id),
  quantity   integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);
--;;
create table legal_documents (
  id             bigserial primary key,
  doc_type       text not null check (doc_type in ('terms-of-sale','privacy','returns')),
  version        integer not null,
  effective_date date not null,
  title          text not null,
  body_html      text not null,
  created_at     timestamptz not null default now(),
  unique (doc_type, version)
);
--;;
create sequence order_number_seq start 4871;
--;;
create table orders (
  order_number         text primary key,
  user_id              text references users(id),
  status               text not null default 'placed',
  contact              jsonb not null,
  delivery_address     jsonb not null,
  delivery_method_code text not null,
  zone_code            text,
  subtotal_amount      bigint not null,
  discount_total_amount bigint not null default 0,
  delivery_fee_amount  bigint not null default 0,
  total_amount         bigint not null,
  currency             text not null default 'KES',
  discount_code        text,
  marketing_opt_in     boolean not null default false,
  status_timeline      jsonb not null default '[]'::jsonb,
  tracking_reference   text,
  courier              text,
  tracking_token       text not null,
  placed_at            timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
--;;
create index orders_user_idx on orders (user_id);
--;;
create index orders_status_idx on orders (status);
--;;
create index orders_tracking_token_idx on orders (tracking_token);
--;;
create table order_items (
  id                text primary key,
  order_number      text not null references orders(order_number),
  product_id        text not null,
  variant_id        text not null,
  name              text not null,
  options           jsonb not null default '{}'::jsonb,
  image             jsonb,
  unit_price_amount bigint not null,
  quantity          integer not null,
  line_total_amount bigint not null
);
--;;
create index order_items_order_idx on order_items (order_number);
--;;
create table order_activity_log (
  id           bigserial primary key,
  order_number text not null references orders(order_number),
  at           timestamptz not null default now(),
  actor        text,
  event        text not null,
  from_status  text,
  to_status    text
);
--;;
create table order_notes (
  id           text primary key,
  order_number text not null references orders(order_number),
  at           timestamptz not null default now(),
  author       text,
  body         text not null
);
--;;
create table payments (
  id                   text primary key,
  order_number         text not null references orders(order_number),
  method               text not null check (method in ('mpesa','pay_on_delivery')),
  state                text not null check (state in ('pending','processing','paid','failed','refunded','awaiting_delivery')),
  amount_amount        bigint not null,
  currency             text not null default 'KES',
  mpesa_receipt_number text,
  failure_reason       text,
  checkout_request_id  text,
  phone                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
--;;
create index payments_order_idx on payments (order_number);
--;;
create unique index payments_checkout_request_idx on payments (checkout_request_id) where checkout_request_id is not null;
--;;
create table refunds (
  id           text primary key,
  order_number text not null references orders(order_number),
  amount_amount bigint not null,
  currency     text not null default 'KES',
  reason       text,
  reference    text,
  restock      boolean not null default false,
  created_by   text,
  created_at   timestamptz not null default now()
);
--;;
-- Immutable proof-of-acceptance, written in the same transaction as the order.
-- There is deliberately no update or delete path for this table.
create table agreement_acceptances (
  id                     text primary key,
  order_number           text not null unique references orders(order_number),
  customer_email         text not null,
  customer_user_id       text,
  accepted_at            timestamptz not null,
  terms_of_sale_version  integer not null,
  returns_policy_version integer not null,
  ip_address             text,
  user_agent             text
);
--;;
create table idempotency_keys (
  id            bigserial primary key,
  scope         text not null,
  idem_key      text not null,
  request_hash  text not null,
  response_status integer,
  response_body jsonb,
  created_at    timestamptz not null default now(),
  unique (scope, idem_key)
);
--;;
create table subscribers (
  id            text primary key,
  email         text not null,
  status        text not null default 'pending' check (status in ('pending','confirmed','unsubscribed')),
  source        text not null,
  product_id    text,
  variant_id    text,
  new_arrivals  boolean not null default true,
  back_in_stock boolean not null default false,
  journal       boolean not null default false,
  confirm_token text,
  unsub_token   text,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  unique (email, variant_id)
);
--;;
create table contact_messages (
  id           text primary key,
  reference    text not null unique,
  name         text not null,
  email        text not null,
  phone        text,
  topic        text not null,
  order_number text,
  message      text not null,
  handled      boolean not null default false,
  created_at   timestamptz not null default now()
);
--;;
create table reviews (
  id                text primary key,
  product_id        text not null references products(id),
  user_id           text references users(id),
  author_first_name text not null,
  author_email      text,
  rating            integer not null check (rating between 1 and 5),
  title             text,
  body              text not null,
  verified_purchase boolean not null default false,
  status            text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason     text,
  order_number      text,
  created_at        timestamptz not null default now(),
  unique (product_id, user_id)
);
--;;
create table addresses (
  id             text primary key,
  user_id        text not null references users(id),
  recipient_name text not null,
  phone          text not null,
  county         text not null,
  town           text not null,
  instructions   text,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now()
);
--;;
create table wishlist_items (
  user_id    text not null references users(id),
  product_id text not null references products(id),
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
--;;
create table journal_posts (
  slug               text primary key,
  title              text not null,
  excerpt            text,
  tag                text,
  cover_image_id     text,
  hero_image_id      text,
  body_html          text,
  shop_the_look_ids  jsonb not null default '[]'::jsonb,
  related_slugs      jsonb not null default '[]'::jsonb,
  seo                jsonb not null default '{}'::jsonb,
  status             text not null default 'published' check (status in ('draft','published')),
  published_at       timestamptz
);
--;;
create table delivery_zones (
  code       text primary key,
  label      text not null,
  counties   jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0
);
--;;
create table delivery_methods (
  code                    text primary key,
  zone_code               text not null references delivery_zones(code),
  label                   text not null,
  fee_amount              bigint not null,
  currency                text not null default 'KES',
  eta                     text not null,
  pay_on_delivery_allowed boolean not null default true,
  sort_order              integer not null default 0
);
--;;
create table broadcasts (
  id             text primary key,
  subject        text not null,
  intro_html     text,
  product_ids    jsonb not null default '[]'::jsonb,
  collection_slug text,
  audience       text not null default 'new_arrivals_optin',
  status         text not null default 'queued' check (status in ('queued','sending','sent')),
  recipient_count integer not null default 0,
  sent_count     integer not null default 0,
  open_count     integer not null default 0,
  created_at     timestamptz not null default now()
);
--;;
create table home_content (
  id   integer primary key default 1 check (id = 1),
  data jsonb not null
);
--;;
-- Outbox for enqueued notifications (order confirmation, receipts, transition
-- emails, back-in-stock). A worker drains this, the API only enqueues.
create table notification_outbox (
  id           bigserial primary key,
  kind         text not null,
  payload      jsonb not null,
  status       text not null default 'queued' check (status in ('queued','sent','failed')),
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
