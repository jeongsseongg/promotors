-- Apply after branch-read-access.sql and branch-write-access.sql.
-- Keep the existing delete API's key, session, privacy and non-general role gates.
DO $branch_delete_prerequisites$
BEGIN
  IF to_regprocedure('pm_branch_access_private.require_write_payload(public.pm_accounts,text,jsonb)') IS NULL
      OR to_regprocedure('pm_branch_access_private.write_row_branch(text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'BRANCH_WRITE_GUARDS_REQUIRED';
  END IF;
END $branch_delete_prerequisites$;

CREATE OR REPLACE FUNCTION pm_branch_access_private.delete_rows(
  account public.pm_accounts, p_key text, p_id text, current_payload jsonb, p_page_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE item jsonb; next_payload jsonb; matched integer := 0; own_count integer;
BEGIN
  PERFORM pm_branch_access_private.require_write_payload(account,p_key,'[]'::jsonb);
  IF p_key IS DISTINCT FROM 'pm-service-runs' OR btrim(coalesce(p_id,''))='' THEN
    RAISE EXCEPTION 'KEY_NOT_ALLOWED';
  END IF;
  IF jsonb_typeof(current_payload) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'FORBIDDEN_ROW'; END IF;
  -- The original public routine already holds this site_data row FOR UPDATE.
  -- All duplicate IDs must be owned; otherwise none of them may be deleted.
  FOR item IN SELECT value FROM jsonb_array_elements(current_payload) WHERE value->>'id'=p_id LOOP
    matched := matched+1;
    IF NOT coalesce(account.branches ? pm_branch_access_private.write_row_branch(p_key,item),false) THEN
      RAISE EXCEPTION 'FORBIDDEN_ROW';
    END IF;
  END LOOP;
  IF matched=0 THEN RAISE EXCEPTION 'FORBIDDEN_ROW'; END IF;
  SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO next_payload
    FROM jsonb_array_elements(current_payload) WITH ORDINALITY AS entries(value,ordinal)
    WHERE value->>'id' IS DISTINCT FROM p_id;
  UPDATE public.site_data SET payload=next_payload,page_url=p_page_url,updated_at=now() WHERE data_key=p_key;
  SELECT count(*) INTO own_count FROM jsonb_array_elements(next_payload) value
    WHERE coalesce(account.branches ? pm_branch_access_private.write_row_branch(p_key,value),false);
  RETURN jsonb_build_object('ok',true,'count',own_count);
END $$;
REVOKE ALL ON FUNCTION pm_branch_access_private.delete_rows(public.pm_accounts,text,text,jsonb,text)
  FROM PUBLIC, anon, authenticated;

DO $branch_delete_patch$
DECLARE routine regprocedure; definition text; patched text; source_hash text;
  expected_before text := '7bd7ccc8ff43322dbb796091656f001f';
  expected_after text := '5dbc80da80ecce169e48fd3e4d4f2aaf';
  anchor text := E'  select payload into current_payload\n  from public.site_data\n  where data_key = p_key\n  for update;\n';
  insertion text := E'\n  -- pm_branch_access_general_delete_v1\n  if account.role = ''general'' then\n'
    || E'    return pm_branch_access_private.delete_rows(account,p_key,p_id,current_payload,p_page_url);\n  end if;\n';
BEGIN
  routine := to_regprocedure('public.pm_sync_delete_by_id(text,text,text,text)');
  IF routine IS NULL THEN RAISE EXCEPTION 'BRANCH_DELETE_ROUTINE_MISSING'; END IF;
  definition := pg_get_functiondef(routine); source_hash := md5(definition);
  IF source_hash=expected_before THEN
    IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN
      RAISE EXCEPTION 'BRANCH_DELETE_ANCHOR_MISMATCH';
    END IF;
    patched := replace(definition,anchor,anchor || insertion);
    IF md5(patched)<>expected_after THEN RAISE EXCEPTION 'BRANCH_DELETE_PATCH_FAILED'; END IF;
    EXECUTE patched;
  ELSIF source_hash<>expected_after THEN RAISE EXCEPTION 'BRANCH_DELETE_SOURCE_MISMATCH'; END IF;
  IF md5(pg_get_functiondef(routine))<>expected_after THEN RAISE EXCEPTION 'BRANCH_DELETE_VERIFY_FAILED'; END IF;
END $branch_delete_patch$;
