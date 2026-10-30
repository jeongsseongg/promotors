-- Scope only general administrators. Preserve the live public routines and their ACLs.
-- Apply with branch-read-access.sql after backing up the live definitions.
CREATE SCHEMA IF NOT EXISTS pm_branch_access_private;
REVOKE ALL ON SCHEMA pm_branch_access_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.write_row_branch(p_key text, item jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE explicit_branch text; derived_branch text; direct_owner text; embedded_owner text;
BEGIN
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  direct_owner := nullif(item->>'memberId', '');
  embedded_owner := nullif(item#>>'{customer,id}', '');
  IF direct_owner IS NOT NULL AND embedded_owner IS NOT NULL
      AND direct_owner IS DISTINCT FROM embedded_owner THEN RETURN NULL; END IF;
  IF item ? 'branch' THEN
    IF jsonb_typeof(item->'branch') IS DISTINCT FROM 'string'
        OR btrim(item->>'branch') = '' THEN RETURN NULL; END IF;
    explicit_branch := item->>'branch';
  END IF;
  IF p_key <> 'pm-messages' THEN RETURN explicit_branch; END IF;
  derived_branch := public.pm_push_inquiry_branch(item);
  IF derived_branch IS NULL OR btrim(derived_branch) = '' THEN RETURN NULL; END IF;
  IF explicit_branch IS NOT NULL AND explicit_branch IS DISTINCT FROM derived_branch THEN RETURN NULL; END IF;
  IF coalesce(item->'serviceContext', '{}'::jsonb) ? 'branch' THEN
    IF jsonb_typeof(item#>'{serviceContext,branch}') IS DISTINCT FROM 'string'
        OR item#>>'{serviceContext,branch}' IS DISTINCT FROM derived_branch THEN RETURN NULL; END IF;
  END IF;
  RETURN derived_branch;
END $$;
REVOKE ALL ON FUNCTION pm_branch_access_private.write_row_branch(text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.require_write_payload(
  account public.pm_accounts, p_key text, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF account.role IS DISTINCT FROM 'general' OR NOT coalesce(account.active, false)
      OR account.login_id IS NULL THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF jsonb_typeof(account.branches) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'BRANCH_FORBIDDEN'; END IF;
  IF jsonb_array_length(account.branches) = 0 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(account.branches) b
      WHERE jsonb_typeof(b) <> 'string' OR btrim(b#>>'{}') = '') THEN
    RAISE EXCEPTION 'BRANCH_FORBIDDEN';
  END IF;
  IF p_key IS NULL OR p_key NOT IN ('pm-bookings','pm-service-runs','pm-work-audit','pm-messages') THEN
    RAISE EXCEPTION 'KEY_NOT_ALLOWED';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload) x
      WHERE jsonb_typeof(x) IS DISTINCT FROM 'object' OR btrim(coalesce(x->>'id','')) = '') THEN
    RAISE EXCEPTION 'ROW_ID_REQUIRED';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_payload)) <>
      (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_payload) x) THEN
    RAISE EXCEPTION 'DUPLICATE_ROW_ID';
  END IF;
END $$;
REVOKE ALL ON FUNCTION pm_branch_access_private.require_write_payload(public.pm_accounts,text,jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.require_write_reference(p_key text, item jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE source_key text; reference_id text; linked jsonb; matches integer;
  owner_id text; linked_owner text;
BEGIN
  IF p_key='pm-service-runs' AND nullif(item->>'bookingKey','') IS NOT NULL THEN
    source_key := 'pm-bookings'; reference_id := item->>'bookingKey';
  ELSIF p_key='pm-work-audit' AND nullif(item->>'runId','') IS NOT NULL THEN
    source_key := 'pm-service-runs'; reference_id := item->>'runId';
  ELSE RETURN; END IF;
  SELECT count(*),jsonb_agg(x)->0 INTO matches,linked FROM public.site_data sd
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sd.payload)='array'
      THEN sd.payload ELSE '[]'::jsonb END) x
    WHERE sd.data_key=source_key AND x->>'id'=reference_id;
  IF matches<>1 OR pm_branch_access_private.write_row_branch(source_key,linked)
      IS DISTINCT FROM item->>'branch' THEN RAISE EXCEPTION 'FORBIDDEN_ROW'; END IF;
  owner_id := coalesce(nullif(item->>'memberId',''),nullif(item#>>'{customer,id}',''));
  linked_owner := coalesce(nullif(linked->>'memberId',''),nullif(linked#>>'{customer,id}',''));
  IF (p_key='pm-service-runs' OR owner_id IS NOT NULL) AND owner_id IS DISTINCT FROM linked_owner THEN
    RAISE EXCEPTION 'FORBIDDEN_ROW';
  END IF;
END $$;
REVOKE ALL ON FUNCTION pm_branch_access_private.require_write_reference(text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.prepare_write_rows(
  account public.pm_accounts, p_key text, p_payload jsonb, current_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE incoming jsonb := '[]'::jsonb; item jsonb; prior jsonb;
  branch text; old_branch text; owner_id text; old_owner_id text;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload) LOOP
    branch := pm_branch_access_private.write_row_branch(p_key,item);
    IF branch IS NULL OR NOT coalesce(account.branches ? branch,false) THEN RAISE EXCEPTION 'FORBIDDEN_ROW'; END IF;
    -- Legacy customer inquiries may lack branch. Normalize only from trusted server linkage.
    IF p_key='pm-messages' AND NOT item ? 'branch' THEN item := item || jsonb_build_object('branch',branch); END IF;
    owner_id := coalesce(nullif(item->>'memberId',''),nullif(item#>>'{customer,id}',''));
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(current_payload) x WHERE x->>'id'=item->>'id') THEN
      PERFORM pm_branch_access_private.require_write_reference(p_key,item);
    END IF;
    FOR prior IN SELECT value FROM jsonb_array_elements(current_payload)
      WHERE value->>'id'=item->>'id' LOOP
      old_branch := pm_branch_access_private.write_row_branch(p_key,prior);
      IF old_branch IS NULL OR NOT coalesce(account.branches ? old_branch,false)
          OR old_branch IS DISTINCT FROM branch THEN RAISE EXCEPTION 'FORBIDDEN_ROW'; END IF;
      old_owner_id := coalesce(nullif(prior->>'memberId',''),nullif(prior#>>'{customer,id}',''));
      IF prior->'id' IS DISTINCT FROM item->'id' OR old_owner_id IS DISTINCT FROM owner_id
          OR (p_key='pm-service-runs' AND coalesce(prior->>'bookingKey','') IS DISTINCT FROM coalesce(item->>'bookingKey',''))
          OR (p_key='pm-work-audit' AND coalesce(prior->>'runId','') IS DISTINCT FROM coalesce(item->>'runId','')) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROW';
      END IF;
    END LOOP;
    incoming := incoming || jsonb_build_array(item);
  END LOOP;
  RETURN incoming;
END $$;
REVOKE ALL ON FUNCTION pm_branch_access_private.prepare_write_rows(public.pm_accounts,text,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.write_rows(
  account public.pm_accounts, p_key text, p_payload jsonb, p_page_url text, p_merge boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE current_payload jsonb; incoming jsonb; merged jsonb := '[]'::jsonb;
  added jsonb; prior jsonb; replacement jsonb; own_count integer;
BEGIN
  PERFORM pm_branch_access_private.require_write_payload(account,p_key,p_payload);
  -- Lock before comparing old/new identities; never replace an unseen other-branch row.
  INSERT INTO public.site_data(data_key,payload,page_url,updated_at)
    VALUES(p_key,'[]'::jsonb,p_page_url,now()) ON CONFLICT(data_key) DO NOTHING;
  SELECT payload INTO current_payload FROM public.site_data WHERE data_key=p_key FOR UPDATE;
  IF jsonb_typeof(current_payload) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
  incoming := pm_branch_access_private.prepare_write_rows(account,p_key,p_payload,current_payload);
  IF p_merge THEN
    -- Existing rows retain order; changed targets are replaced, new targets are prepended.
    FOR prior IN SELECT value FROM jsonb_array_elements(current_payload) LOOP
      SELECT value INTO replacement FROM jsonb_array_elements(incoming)
        WHERE value->>'id'=prior->>'id';
      merged := merged || jsonb_build_array(coalesce(replacement,prior));
    END LOOP;
    SELECT coalesce(jsonb_agg(x ORDER BY ordinal),'[]'::jsonb) INTO added
      FROM jsonb_array_elements(incoming) WITH ORDINALITY AS incoming_rows(x,ordinal)
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(current_payload) old WHERE old->>'id'=x->>'id');
    merged := added || merged;
  ELSE
    -- A full save replaces only this administrator's current branch rows.
    SELECT coalesce(jsonb_agg(x ORDER BY ordinal),'[]'::jsonb) INTO merged
      FROM jsonb_array_elements(current_payload) WITH ORDINALITY AS current_rows(x,ordinal)
      WHERE NOT coalesce(account.branches ? pm_branch_access_private.write_row_branch(p_key,x),false);
    merged := incoming || merged;
  END IF;
  UPDATE public.site_data SET payload=merged,page_url=p_page_url,updated_at=now() WHERE data_key=p_key;
  SELECT count(*) INTO own_count FROM jsonb_array_elements(merged) x
    WHERE coalesce(account.branches ? pm_branch_access_private.write_row_branch(p_key,x),false);
  IF p_merge THEN RETURN jsonb_build_object('ok',true,'count',own_count); END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION pm_branch_access_private.write_rows(public.pm_accounts,text,jsonb,text,boolean)
  FROM PUBLIC, anon, authenticated;

DO $branch_access_write_patch$
DECLARE signature text; definition text; patched text; anchor text; insertion text;
  routine regprocedure; occurrences integer; expected_before text; expected_after text; source_hash text;
BEGIN
  IF to_regprocedure('public.pm_push_inquiry_branch(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'BRANCH_INQUIRY_ROUTING_REQUIRED';
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'public.pm_sync_write(text,text,jsonb,text)',
    'public.pm_sync_merge_by_id(text,text,jsonb,text)',
    'public.pm_branch_hours_write(text,text,jsonb,text)'] LOOP
    routine := to_regprocedure(signature);
    IF routine IS NULL THEN RAISE EXCEPTION 'BRANCH_WRITE_ROUTINE_MISSING: %',signature; END IF;
    definition := pg_get_functiondef(routine);
    IF signature='public.pm_sync_write(text,text,jsonb,text)' THEN
      expected_before := '49ff63133cd4f71f6c6755768f544ec6'; expected_after := '301a4b5ccc6db5eabe76b51e6769b1c5';
      anchor := E'  if account.role in (''main'',''general'') then\n';
      insertion := E'  -- pm_branch_access_general_full_v1\n  if account.role = ''general'' then\n'
        || E'    return pm_branch_access_private.write_rows(account,p_key,p_payload,p_page_url,false);\n  end if;\n\n';
    ELSIF signature='public.pm_sync_merge_by_id(text,text,jsonb,text)' THEN
      expected_before := '1ff0452d88e3547e763f141f224160a1'; expected_after := '6c11984bc58cc50783a069c4c4b0fb11';
      anchor := E'  car_number := coalesce(account.profile->>''car'', '''');\n';
      insertion := E'  -- pm_branch_access_general_merge_v1\n  if account.role = ''general'' then\n'
        || E'    return pm_branch_access_private.write_rows(account,p_key,p_payload,p_page_url,true);\n  end if;\n\n';
    ELSE
      expected_before := 'efcda7552f0e0cca760c1da9792c9cf8'; expected_after := 'b8f3514ca95921415592d905625a6ce8';
      anchor := E'  if account.role = ''general''\n'
        || E'     and jsonb_array_length(coalesce(account.branches, ''[]''::jsonb)) > 0\n'
        || E'     and not coalesce(account.branches ? clean_branch, false) then\n';
      insertion := E'  -- pm_branch_access_general_hours_v1\n  if account.role = ''general''\n'
        || E'     and (jsonb_typeof(account.branches) is distinct from ''array''\n'
        || E'          or not coalesce(account.branches ? clean_branch, false)) then\n';
    END IF;
    source_hash := md5(definition);
    IF source_hash=expected_after THEN CONTINUE; END IF;
    IF source_hash<>expected_before THEN RAISE EXCEPTION 'BRANCH_WRITE_SOURCE_MISMATCH: %',signature; END IF;
    occurrences := (length(definition)-length(replace(definition,anchor,'')))/length(anchor);
    IF occurrences<>1 THEN RAISE EXCEPTION 'BRANCH_WRITE_ANCHOR_MISMATCH: %',signature; END IF;
    IF signature='public.pm_branch_hours_write(text,text,jsonb,text)' THEN
      patched := replace(definition,anchor,insertion);
    ELSE
      patched := replace(definition,anchor,insertion || anchor);
    END IF;
    IF md5(patched)<>expected_after THEN RAISE EXCEPTION 'BRANCH_WRITE_PATCH_FAILED: %',signature; END IF;
    EXECUTE patched;
    IF md5(pg_get_functiondef(routine))<>expected_after THEN
      RAISE EXCEPTION 'BRANCH_WRITE_VERIFY_FAILED: %',signature;
    END IF;
  END LOOP;
END $branch_access_write_patch$;
