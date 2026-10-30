-- Add branch restrictions to the two Promotors buckets only. Existing policies
-- (including erasure restrictions and other applications' buckets) are retained.
CREATE OR REPLACE FUNCTION pm_branch_access_private.register_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account public.pm_accounts%rowtype; token text; snapshot jsonb:='[]'::jsonb;
  uploader text;
BEGIN
  IF NEW.bucket_id IS DISTINCT FROM 'promotors-private' THEN RETURN NEW; END IF;
  token:=coalesce((nullif(current_setting('request.headers',true),'')::jsonb)->>'x-promotors-token','');
  SELECT a.* INTO account FROM public.pm_sessions s JOIN public.pm_accounts a USING(login_id)
    WHERE s.token_hash=public.pm_token_hash(token) AND s.expires_at>now() AND a.active LIMIT 1;
  IF account.role IN ('main','general') THEN
    uploader:=account.login_id;
    IF account.role='general' AND pm_branch_access_private.asset_branches_valid(account.branches) THEN
      snapshot:=account.branches;
    END IF;
  END IF;
  -- A trusted server insert without an app token must not inherit an old pending
  -- uploader's preview permission when a deleted object name is reused.
  INSERT INTO pm_branch_access_private.upload_bindings(asset_key,uploader_login_id,branches,created_at)
    VALUES(NEW.name,uploader,snapshot,now())
  ON CONFLICT(asset_key) DO UPDATE SET uploader_login_id=excluded.uploader_login_id,
    branches=excluded.branches,created_at=excluded.created_at;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pm_branch_access_private.register_upload() FROM PUBLIC, anon, authenticated;

-- This boolean is bound into RLS by OID. Only EXECUTE is granted; clients retain
-- no USAGE on the private schema and cannot directly resolve its functions.
CREATE OR REPLACE FUNCTION pm_branch_access_private.storage_allowed(
  p_action text,p_bucket text,p_key text,p_token text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE account public.pm_accounts%rowtype;
BEGIN
  IF p_bucket NOT IN ('promotors-public','promotors-private') THEN RETURN true; END IF;
  IF p_action='read' THEN
    IF p_bucket='promotors-public' THEN RETURN true; END IF;
    RETURN public.pm_storage_can_read_private(p_key,p_token);
  END IF;
  SELECT a.* INTO account FROM public.pm_sessions s JOIN public.pm_accounts a USING(login_id)
    WHERE s.token_hash=public.pm_token_hash(p_token) AND s.expires_at>now() AND a.active LIMIT 1;
  IF account.login_id IS NULL THEN RETURN false; END IF;
  IF p_action='mutate' THEN RETURN account.role='main'; END IF;
  IF p_action IS DISTINCT FROM 'insert' THEN RETURN false; END IF;
  IF account.role='main' THEN RETURN true; END IF;
  IF p_bucket<>'promotors-private' OR account.role IS DISTINCT FROM 'general'
      OR NOT pm_branch_access_private.asset_branches_valid(account.branches)
      OR p_key IS NULL OR p_key !~ '^service-' THEN RETURN false; END IF;
  IF pm_branch_access_private.asset_attached_outside(p_key,account.branches) THEN RETURN false; END IF;
  IF (EXISTS(SELECT 1 FROM public.pm_assets a WHERE a.asset_key=p_key)
      OR EXISTS(SELECT 1 FROM public.site_data sd WHERE sd.data_key='pm-assets'
        AND jsonb_typeof(sd.payload)='object' AND sd.payload ? p_key))
      AND NOT pm_branch_access_private.asset_attached(p_key,account.branches) THEN RETURN false; END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION pm_branch_access_private.storage_allowed(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pm_branch_access_private.storage_allowed(text,text,text,text) TO anon, authenticated;
REVOKE ALL ON SCHEMA pm_branch_access_private FROM PUBLIC, anon, authenticated;

DO $branch_asset_trigger$
DECLARE actual text;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RAISE EXCEPTION 'STORAGE_OBJECTS_REQUIRED'; END IF;
  SELECT pg_get_triggerdef(oid) INTO actual FROM pg_trigger
    WHERE tgrelid='storage.objects'::regclass AND tgname='promotors_branch_upload_binding';
  IF actual IS NULL THEN
    CREATE TRIGGER promotors_branch_upload_binding BEFORE INSERT ON storage.objects
      FOR EACH ROW WHEN (NEW.bucket_id='promotors-private')
      EXECUTE FUNCTION pm_branch_access_private.register_upload();
    SELECT pg_get_triggerdef(oid) INTO actual FROM pg_trigger
      WHERE tgrelid='storage.objects'::regclass AND tgname='promotors_branch_upload_binding';
  END IF;
  IF md5(actual)<>'ae3e3dcfb70c3e21366f5436b7f4641c' THEN
    RAISE EXCEPTION 'BRANCH_ASSET_TRIGGER_SOURCE_MISMATCH';
  END IF;
END $branch_asset_trigger$;

DO $branch_asset_storage_policies$
DECLARE suffix text; action_name text; command_name text; policy_name text;
  expression text; definition text; using_hash text; check_hash text;
  actual_using text; actual_check text; actual_cmd text; permissive boolean;
  actual_roles oid[]; expected_roles oid[];
BEGIN
  SELECT array_agg(oid ORDER BY oid) INTO expected_roles FROM pg_roles WHERE rolname IN ('anon','authenticated');
  IF cardinality(expected_roles)<>2 THEN RAISE EXCEPTION 'STORAGE_CLIENT_ROLES_REQUIRED'; END IF;
  FOREACH suffix IN ARRAY ARRAY['read','insert','update','delete'] LOOP
    policy_name:='promotors_branch_' || suffix || '_boundary';
    action_name:=CASE WHEN suffix='read' THEN 'read' WHEN suffix='insert' THEN 'insert' ELSE 'mutate' END;
    command_name:=CASE WHEN suffix='read' THEN 'SELECT' ELSE upper(suffix) END;
    expression:='CASE WHEN bucket_id IN (''promotors-public'',''promotors-private'') THEN '
      || 'pm_branch_access_private.storage_allowed(' || quote_literal(action_name) || ',bucket_id,name,'
      || 'coalesce((nullif(current_setting(''request.headers'',true),'''')::jsonb)->>''x-promotors-token'','''')) ELSE true END';
    IF suffix='read' THEN
      using_hash:='a67beb3504eaad99642cff38d3c4412e'; check_hash:='d41d8cd98f00b204e9800998ecf8427e';
    ELSIF suffix='insert' THEN
      using_hash:='d41d8cd98f00b204e9800998ecf8427e'; check_hash:='f0289bda27aff6a5cc48a786b09a7ad1';
    ELSIF suffix='update' THEN
      using_hash:='6f49556bbf0428811d63a4e42e77191a'; check_hash:=using_hash;
    ELSE
      using_hash:='6f49556bbf0428811d63a4e42e77191a'; check_hash:='d41d8cd98f00b204e9800998ecf8427e';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname=policy_name) THEN
      definition:='CREATE POLICY ' || quote_ident(policy_name) || ' ON storage.objects AS RESTRICTIVE FOR '
        || command_name || ' TO anon,authenticated ';
      IF suffix='insert' THEN definition:=definition || 'WITH CHECK (' || expression || ')';
      ELSE definition:=definition || 'USING (' || expression || ')'; END IF;
      IF suffix='update' THEN definition:=definition || ' WITH CHECK (' || expression || ')'; END IF;
      EXECUTE definition;
    END IF;
    SELECT polcmd::text,polpermissive,
      md5(coalesce(pg_get_expr(polqual,polrelid),'')),md5(coalesce(pg_get_expr(polwithcheck,polrelid),'')),
      ARRAY(SELECT x FROM unnest(polroles) x ORDER BY x)
      INTO actual_cmd,permissive,actual_using,actual_check,actual_roles
      FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname=policy_name;
    IF permissive OR actual_cmd IS DISTINCT FROM (CASE suffix WHEN 'read' THEN 'r' WHEN 'insert' THEN 'a' WHEN 'update' THEN 'w' ELSE 'd' END)
        OR actual_using IS DISTINCT FROM using_hash OR actual_check IS DISTINCT FROM check_hash
        OR actual_roles IS DISTINCT FROM expected_roles THEN
      RAISE EXCEPTION 'BRANCH_ASSET_POLICY_SOURCE_MISMATCH: %',policy_name;
    END IF;
  END LOOP;
END $branch_asset_storage_policies$;
