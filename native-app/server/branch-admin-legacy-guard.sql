-- Apply before branch-admin-accounts.sql after verifying/backing up both live definitions.
-- Atomic metadata-preserving patch: only the two known legacy account selection filters change.
do $branch_admin_guard$
declare
  signature text; routine regprocedure; definition text; patched text; matches integer; prefix text;
  pattern text := 'where[[:space:]]+role[[:space:]]+in[[:space:]]*\([[:space:]]*''main''[[:space:]]*,[[:space:]]*''general''[[:space:]]*\)[[:space:]]+and[[:space:]]+active\y';
  predicate text := ' and coalesce(profile->>''loginMode'','''')<>''id_password''';
begin
  foreach signature in array array['public.pm_admin_login(text)','public.pm_admin_login(text,boolean)'] loop
    routine := pg_catalog.to_regprocedure(signature);
    if routine is null then raise exception 'LEGACY_LOGIN_SIGNATURE_MISSING'; end if;
    definition := pg_catalog.pg_get_functiondef(routine);
    select count(*) into matches from pg_catalog.regexp_matches(definition,pattern,'gi');
    if matches<>1 then raise exception 'LEGACY_LOGIN_FILTER_MISMATCH'; end if;
    prefix := (pg_catalog.regexp_match(definition,pattern,'i'))[1];
    if position(prefix||predicate in definition)>0 then continue; end if;
    if position('id_password' in definition)>0 then raise exception 'LEGACY_LOGIN_GUARD_MISMATCH'; end if;
    patched := pg_catalog.regexp_replace(definition,pattern,'\&'||predicate,'i');
    if patched=definition or position(prefix||predicate in patched)=0 then raise exception 'LEGACY_LOGIN_PATCH_FAILED'; end if;
    execute patched;
  end loop;
end $branch_admin_guard$;
