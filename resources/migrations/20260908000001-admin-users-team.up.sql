-- A16 team management: admin_users gains status / must_change_password /
-- last_login_at, the role vocabulary becomes owner|staff, and email uniqueness
-- becomes case-insensitive (backs 409 email_taken, including vs disabled rows).
alter table admin_users add column status text not null default 'active';
--;;
alter table admin_users add constraint admin_users_status_check check (status in ('active', 'disabled'));
--;;
alter table admin_users add column must_change_password boolean not null default false;
--;;
alter table admin_users add column last_login_at timestamptz;
--;;
alter table admin_users drop constraint if exists admin_users_role_check;
--;;
update admin_users set role = 'owner' where role = 'admin';
--;;
alter table admin_users alter column role drop default;
--;;
alter table admin_users add constraint admin_users_role_check check (role in ('owner', 'staff'));
--;;
alter table admin_users drop constraint if exists admin_users_email_key;
--;;
create unique index admin_users_email_lower_idx on admin_users (lower(email));
