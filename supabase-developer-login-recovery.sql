-- 개발자 로그인 복구: 요청된 개발자 비밀번호로 전용 계정을 다시 활성화합니다.
begin;
create extension if not exists pgcrypto;

insert into public.pm_accounts(login_id, password_hash, role, branches, profile, active, updated_at)
values (
  '__developer__',
  crypt('roqkfwk1234', gen_salt('bf', 11)),
  'main',
  '[]'::jsonb,
  '{"developer":true,"label":"개발자"}'::jsonb,
  true,
  now()
)
on conflict (login_id) do update
set password_hash = excluded.password_hash,
    role = 'main',
    branches = '[]'::jsonb,
    profile = excluded.profile,
    active = true,
    updated_at = now();

delete from public.pm_sessions where login_id = '__developer__';
commit;
notify pgrst, 'reload schema';

select login_id, role, active, profile->>'label' as label, updated_at
from public.pm_accounts
where login_id = '__developer__';
