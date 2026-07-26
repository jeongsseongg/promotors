-- Run after supabase-security-migration.sql.
-- Restores the main administrator after forced credential rotation.
begin;
create extension if not exists pgcrypto;
update public.pm_accounts
set password_hash = crypt('Pm!28cd889f85904beebfc27', gen_salt('bf', 11)),
    active = true,
    updated_at = now()
where login_id = '__main_admin__' and role = 'main';
-- Legacy general-admin passwords were previously exposed in frontend data.
-- Recreate required branch accounts from the secured administrator settings screen.
delete from public.pm_accounts where role = 'general';
delete from public.pm_sessions;
commit;
notify pgrst, 'reload schema';
select login_id, role, active, updated_at
from public.pm_accounts
where login_id = '__main_admin__';
