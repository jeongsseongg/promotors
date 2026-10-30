-- Private-photo branch boundary. No existing photo or customer rows are backfilled.
-- Apply after branch-read/write-access.sql, together with branch-asset-storage.sql.
CREATE TABLE IF NOT EXISTS pm_branch_access_private.upload_bindings (
  asset_key text PRIMARY KEY,
  uploader_login_id text,
  branches jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(branches)='array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pm_branch_access_private.upload_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pm_branch_access_private.upload_bindings FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.asset_branches_valid(p_branches jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT CASE WHEN jsonb_typeof(p_branches)='array' THEN jsonb_array_length(p_branches)>0
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_branches) b
      WHERE jsonb_typeof(b) IS DISTINCT FROM 'string' OR btrim(b#>>'{}')='') ELSE false END;
$$;
REVOKE ALL ON FUNCTION pm_branch_access_private.asset_branches_valid(jsonb) FROM PUBLIC, anon, authenticated;

-- Only steps[].photoKeys is an attachment. A key in a memo grants no access.
-- NULL branch output still counts as an attachment for pending-preview denial.
CREATE OR REPLACE FUNCTION pm_branch_access_private.asset_attachment_branches(p_key text)
RETURNS SETOF text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT DISTINCT pm_branch_access_private.row_branch('pm-service-runs',run)
  FROM public.site_data sd CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(sd.payload)='array' THEN sd.payload ELSE '[]'::jsonb END) run
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(run->'steps')='array' THEN run->'steps' ELSE '[]'::jsonb END) step
  WHERE sd.data_key='pm-service-runs' AND nullif(p_key,'') IS NOT NULL
    AND (CASE WHEN jsonb_typeof(step->'photoKeys')='array' THEN step->'photoKeys' ELSE '[]'::jsonb END) ? p_key;
$$;
REVOKE ALL ON FUNCTION pm_branch_access_private.asset_attachment_branches(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.asset_attached(p_key text,p_branches jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM pm_branch_access_private.asset_attachment_branches(p_key) branch
    WHERE p_branches IS NULL OR coalesce(p_branches ? branch,false));
$$;
REVOKE ALL ON FUNCTION pm_branch_access_private.asset_attached(text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.asset_attached_outside(p_key text,p_branches jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM pm_branch_access_private.asset_attachment_branches(p_key) branch
    WHERE NOT coalesce(p_branches ? branch,false));
$$;
REVOKE ALL ON FUNCTION pm_branch_access_private.asset_attached_outside(text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.general_asset_attached(p_key text,account public.pm_accounts)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT account.role='general' AND coalesce(account.active,false)
    AND pm_branch_access_private.asset_branches_valid(account.branches)
    AND pm_branch_access_private.asset_attached(p_key,account.branches);
$$;
REVOKE ALL ON FUNCTION pm_branch_access_private.general_asset_attached(text,public.pm_accounts) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.general_asset_allowed(p_key text,account public.pm_accounts)
-- INSERT RETURNING checks SELECT RLS after the BEFORE trigger. Each lookup must
-- see that statement's newly registered binding, rather than its start snapshot.
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF account.role IS DISTINCT FROM 'general' OR NOT coalesce(account.active,false)
      OR NOT pm_branch_access_private.asset_branches_valid(account.branches) THEN RETURN false; END IF;
  IF pm_branch_access_private.asset_attached(p_key,account.branches) THEN RETURN true; END IF;
  IF pm_branch_access_private.asset_attached(p_key,NULL) THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM pm_branch_access_private.upload_bindings b
    WHERE b.asset_key=p_key AND b.uploader_login_id=account.login_id
      AND b.created_at>now()-interval '1 hour' AND b.created_at<=now()
      AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(b.branches) branch
        WHERE coalesce(account.branches ? branch,false)));
END $$;
REVOKE ALL ON FUNCTION pm_branch_access_private.general_asset_allowed(text,public.pm_accounts) FROM PUBLIC, anon, authenticated;

-- A reference introduced by the caller cannot establish ownership by itself.
CREATE OR REPLACE FUNCTION pm_branch_access_private.validate_asset_rows(account public.pm_accounts,item jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE step jsonb; value jsonb; photo_key text; target_branches jsonb;
BEGIN
  IF account.role IS DISTINCT FROM 'general' THEN RETURN; END IF;
  IF NOT coalesce(account.active,false) OR NOT pm_branch_access_private.asset_branches_valid(account.branches)
      OR jsonb_typeof(item->'branch') IS DISTINCT FROM 'string'
      OR NOT coalesce(account.branches ? (item->>'branch'),false) THEN RAISE EXCEPTION 'FORBIDDEN_ASSET'; END IF;
  IF item ? 'steps' AND jsonb_typeof(item->'steps') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
  target_branches:=jsonb_build_array(item->>'branch');
  FOR step IN SELECT x FROM jsonb_array_elements(coalesce(item->'steps','[]'::jsonb)) x LOOP
    IF jsonb_typeof(step) IS DISTINCT FROM 'object' OR (step ? 'photoKeys'
        AND jsonb_typeof(step->'photoKeys') IS DISTINCT FROM 'array') THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
    FOR value IN SELECT x FROM jsonb_array_elements(coalesce(step->'photoKeys','[]'::jsonb)) x LOOP
      IF jsonb_typeof(value) IS DISTINCT FROM 'string' OR btrim(value#>>'{}')='' THEN RAISE EXCEPTION 'FORBIDDEN_ASSET'; END IF;
      photo_key:=value#>>'{}';
      IF pm_branch_access_private.asset_attached(photo_key,target_branches) THEN CONTINUE; END IF;
      IF pm_branch_access_private.asset_attached(photo_key,NULL) OR NOT EXISTS(
        SELECT 1 FROM pm_branch_access_private.upload_bindings b WHERE b.asset_key=photo_key
          AND b.branches ? (item->>'branch')) THEN RAISE EXCEPTION 'FORBIDDEN_ASSET'; END IF;
    END LOOP;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION pm_branch_access_private.validate_asset_rows(public.pm_accounts,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.asset_main(p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.pm_sessions s JOIN public.pm_accounts a USING(login_id)
    WHERE s.token_hash=public.pm_token_hash(p_token) AND s.expires_at>now() AND a.active AND a.role='main');
$$;
REVOKE ALL ON FUNCTION pm_branch_access_private.asset_main(text) FROM PUBLIC, anon, authenticated;

DO $branch_asset_public_patch$
DECLARE signature text; routine regprocedure; definition text; patched text;
  before_hash text; after_hash text; anchor text; insertion text; source_hash text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.pm_asset_get(text,text)',
    'public.pm_storage_can_read_private(text,text)','public.pm_legacy_asset_keys(text)'] LOOP
    routine:=to_regprocedure(signature);
    IF routine IS NULL THEN RAISE EXCEPTION 'BRANCH_ASSET_ROUTINE_MISSING: %',signature; END IF;
    definition:=pg_get_functiondef(routine); source_hash:=md5(definition);
    IF signature='public.pm_asset_get(text,text)' THEN
      before_hash:='abbf45d7153184ed6dd291608388859e'; after_hash:='730b99f7afa0c4bc86fb548c50acb3ff';
      anchor:=E'  if account.role in (''main'', ''general'') then\n    allowed := true;';
      insertion:=E'  if account.role = ''main'' then\n    allowed := true;\n  elsif account.role = ''general'' then\n'
        || E'    allowed := p_key ~ ''^(branch|notice|case|intro|event)-''\n'
        || E'      or pm_branch_access_private.general_asset_attached(p_key,account);';
    ELSIF signature='public.pm_storage_can_read_private(text,text)' THEN
      before_hash:='8abd29b1b28f4e77077a4b810d5d765e'; after_hash:='732c41fdf528b3a7c1a27ebb476645f4';
      anchor:=E'  if account.role in (''main'', ''general'') then return true; end if;';
      insertion:=E'  if account.role = ''main'' then return true; end if;\n'
        || E'  if account.role = ''general'' then return pm_branch_access_private.general_asset_allowed(p_key,account); end if;';
    ELSE
      before_hash:='d191c7885244c41db6f727bfbb856af7'; after_hash:='42569937c27fe08096a75fc6c9ddc4ab';
      anchor:='if not public.pm_storage_is_admin(p_token) then';
      insertion:='if not pm_branch_access_private.asset_main(p_token) then';
    END IF;
    IF source_hash=before_hash THEN
      IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN
        RAISE EXCEPTION 'BRANCH_ASSET_ANCHOR_MISMATCH: %',signature;
      END IF;
      patched:=replace(definition,anchor,insertion);
      IF md5(patched)<>after_hash THEN RAISE EXCEPTION 'BRANCH_ASSET_PATCH_FAILED: %',signature; END IF;
      EXECUTE patched;
    ELSIF source_hash<>after_hash THEN RAISE EXCEPTION 'BRANCH_ASSET_SOURCE_MISMATCH: %',signature; END IF;
    IF md5(pg_get_functiondef(routine))<>after_hash THEN RAISE EXCEPTION 'BRANCH_ASSET_VERIFY_FAILED: %',signature; END IF;
  END LOOP;
END $branch_asset_public_patch$;

-- Body hashes are independent of how pg_get_functiondef qualifies composite args.
-- Windows checkouts may use CRLF; normalize only this private helper's body hash.
DO $branch_asset_write_patch$
DECLARE routine regprocedure; definition text; body text; patched text;
  before_hash text:='b4caf7a61d1ceb33d9ee579ee41bc353';
  after_hash text:='4885ddd77a8e61e6ca0616850a02dd8a';
  anchor text:='    incoming := incoming || jsonb_build_array(item);';
  insertion text:=E'    IF p_key=''pm-service-runs'' THEN\n'
    || E'      PERFORM pm_branch_access_private.validate_asset_rows(account,item);\n    END IF;\n';
BEGIN
  routine:=to_regprocedure('pm_branch_access_private.prepare_write_rows(public.pm_accounts,text,jsonb,jsonb)');
  IF routine IS NULL THEN RAISE EXCEPTION 'BRANCH_WRITE_GUARDS_REQUIRED'; END IF;
  SELECT replace(prosrc,E'\r\n',E'\n') INTO body FROM pg_proc WHERE oid=routine;
  IF md5(body)=before_hash THEN
    IF (length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN
      RAISE EXCEPTION 'BRANCH_ASSET_WRITE_ANCHOR_MISMATCH';
    END IF;
    definition:=pg_get_functiondef(routine);
    patched:=replace(definition,anchor,insertion || anchor);
    EXECUTE patched;
  ELSIF md5(body)<>after_hash THEN RAISE EXCEPTION 'BRANCH_ASSET_WRITE_SOURCE_MISMATCH'; END IF;
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=routine)<>after_hash THEN
    RAISE EXCEPTION 'BRANCH_ASSET_WRITE_VERIFY_FAILED';
  END IF;
END $branch_asset_write_patch$;
