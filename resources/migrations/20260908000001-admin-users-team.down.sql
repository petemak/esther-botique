-- Reverse A16 team management: restore the single-role model and plain
-- case-sensitive email uniqueness.
alter table admin_users drop constraint if exists admin_users_role_check;
--;;
alter table admin_users alter column role set default 'admin';
--;;
update admin_users set role = 'admin' where role in ('owner', 'staff');
--;;
drop index if exists admin_users_email_lower_idx;
--;;
alter table admin_users add constraint admin_users_email_key unique (email);
--;;
alter table admin_users drop constraint if exists admin_users_status_check;
--;;
alter table admin_users drop column if exists status;
--;;
alter table admin_users drop column if exists must_change_password;
--;;
alter table admin_users drop column if exists last_login_at;
