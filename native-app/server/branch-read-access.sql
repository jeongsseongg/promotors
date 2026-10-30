-- Branch-admin read boundary. Main, developer-as-main, customer and anonymous
-- paths retain their existing function bodies and privileges.
-- Apply inside a transaction after backing up the current routine definitions.
CREATE SCHEMA IF NOT EXISTS pm_branch_access_private;
REVOKE ALL ON SCHEMA pm_branch_access_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.strip_credentials(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb; entry record; item jsonb;
BEGIN
  IF jsonb_typeof(p_value) = 'object' THEN
    result := '{}'::jsonb;
    FOR entry IN SELECT key, value FROM jsonb_each(p_value) LOOP
      IF lower(replace(entry.key, '_', '')) = ANY(ARRAY[
        'password','passwordhash','token','sessiontoken','accesstoken','refreshtoken'
      ]) THEN CONTINUE; END IF;
      result := result || jsonb_build_object(entry.key,
        pm_branch_access_private.strip_credentials(entry.value));
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    result := '[]'::jsonb;
    FOR item IN SELECT value FROM jsonb_array_elements(p_value) LOOP
      result := result || jsonb_build_array(pm_branch_access_private.strip_credentials(item));
    END LOOP;
    RETURN result;
  END IF;
  RETURN p_value;
END $function$;
REVOKE ALL ON FUNCTION pm_branch_access_private.strip_credentials(jsonb) FROM PUBLIC, anon, authenticated;

-- Return the verified business branch, or NULL for malformed/ambiguous rows.
-- Customer-supplied message.branch alone never establishes inquiry ownership.
CREATE OR REPLACE FUNCTION pm_branch_access_private.row_branch(p_key text, p_item jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE canonical text; member_id text; customer_id text;
BEGIN
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  member_id := nullif(p_item->>'memberId', '');
  customer_id := nullif(p_item#>>'{customer,id}', '');
  IF member_id IS NOT NULL AND customer_id IS NOT NULL AND member_id <> customer_id THEN
    RETURN NULL;
  END IF;
  IF p_key = 'pm-messages' THEN
    canonical := public.pm_push_inquiry_branch(p_item);
  ELSIF p_key = ANY(ARRAY['pm-bookings','pm-service-runs','pm-work-audit']) THEN
    IF jsonb_typeof(p_item->'branch') IS DISTINCT FROM 'string' THEN RETURN NULL; END IF;
    canonical := p_item->>'branch';
  ELSE RETURN NULL;
  END IF;
  IF canonical IS NULL OR btrim(canonical) = '' THEN RETURN NULL; END IF;
  IF p_item ? 'branch' AND (jsonb_typeof(p_item->'branch') IS DISTINCT FROM 'string'
      OR p_item->>'branch' IS DISTINCT FROM canonical) THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_item->'serviceContext') = 'object' AND p_item->'serviceContext' ? 'branch'
      AND (jsonb_typeof(p_item#>'{serviceContext,branch}') IS DISTINCT FROM 'string'
        OR p_item#>>'{serviceContext,branch}' IS DISTINCT FROM canonical) THEN RETURN NULL; END IF;
  RETURN canonical;
END $function$;
REVOKE ALL ON FUNCTION pm_branch_access_private.row_branch(text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pm_branch_access_private.filter_snapshot(p_rows jsonb, p_branches jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
WITH settings AS (
  SELECT CASE WHEN jsonb_typeof(p_branches) = 'array' THEN
    CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p_branches) b
      WHERE jsonb_typeof(b) IS DISTINCT FROM 'string' OR btrim(b#>>'{}') = '')
      THEN '[]'::jsonb ELSE p_branches END ELSE '[]'::jsonb END AS branches
), rows AS (
  SELECT row, ordinal FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_rows) = 'array'
    THEN p_rows ELSE '[]'::jsonb END) WITH ORDINALITY AS entry(row, ordinal)
  WHERE jsonb_typeof(row) = 'object' AND row ? 'payload'
), visible AS (
  SELECT row, ordinal, settings.branches FROM rows CROSS JOIN settings
  WHERE row->>'data_key' = ANY(ARRAY['pm-privacy-epoch','pm-auth-context','pm-branches',
    'pm-notices','promotors-cases','pm-products','pm-blocked','pm-blog-settings',
    'pm-intro-slides','pm-home-view','pm-event-banners',
    'pm-bookings','pm-service-runs','pm-work-audit','pm-messages'])
), filtered AS (
  SELECT row, ordinal, CASE WHEN row->>'data_key' = ANY(ARRAY[
    'pm-bookings','pm-service-runs','pm-work-audit','pm-messages']) THEN coalesce((
      SELECT jsonb_agg(item ORDER BY position) FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(row->'payload') = 'array' THEN row->'payload' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS items(item, position)
      WHERE branches ? pm_branch_access_private.row_branch(row->>'data_key', item)
    ), '[]'::jsonb) ELSE row->'payload' END AS payload FROM visible
)
SELECT coalesce(jsonb_agg(jsonb_set(row, '{payload}',
  pm_branch_access_private.strip_credentials(payload)) ORDER BY ordinal), '[]'::jsonb) FROM filtered;
$function$;
REVOKE ALL ON FUNCTION pm_branch_access_private.filter_snapshot(jsonb,jsonb) FROM PUBLIC, anon, authenticated;

-- Exact live-source fingerprints prevent applying a patch to an unknown body.
-- The accepted after fingerprints make the migration safe to run again.
DO $patch_branch_reads$
DECLARE definition text; signature regprocedure; source_hash text;
  read_before text := 'c87c4fbd3378840dbcf6b149df695301';
  read_after text := 'f8d07dd349b2ab7353a7cffe8445b00a';
  customer_before text := '833633277e3b815c7b747e5addb9a678';
  customer_after text := 'b21724f586c18ef11ae0503cd6356ee1';
  read_anchor text := E'    end loop;\n    return result;\n  end if;';
  read_replacement text := E'    end loop;\n    if account.role = ''general'' then\n      return pm_branch_access_private.filter_snapshot(result, account.branches);\n    end if;\n    return result;\n  end if;';
  customer_anchor text := 'requester.role not in (''main'', ''general'')';
  customer_replacement text := 'requester.role <> ''main''';
BEGIN
  IF to_regprocedure('public.pm_push_inquiry_branch(jsonb)') IS NULL THEN
    RAISE EXCEPTION '문의 지점 판별 기능이 없어 읽기 권한 변경을 중단했습니다.';
  END IF;
  signature := to_regprocedure('public.pm_sync_read(text)');
  IF signature IS NULL THEN RAISE EXCEPTION '기존 조회 기능이 없습니다.'; END IF;
  definition := pg_get_functiondef(signature); source_hash := md5(definition);
  IF source_hash = read_before THEN
    IF (length(definition)-length(replace(definition,read_anchor,''))) / length(read_anchor) <> 1 THEN
      RAISE EXCEPTION '기존 조회 코드의 적용 위치가 달라 중단했습니다.';
    END IF;
    EXECUTE replace(definition, read_anchor, read_replacement);
  ELSIF source_hash <> read_after THEN
    RAISE EXCEPTION '기존 조회 코드가 확인한 원본과 달라 중단했습니다.';
  END IF;
  IF md5(pg_get_functiondef(signature)) <> read_after THEN
    RAISE EXCEPTION '지점 조회 제한 적용 검증에 실패했습니다.';
  END IF;
  signature := to_regprocedure('public.pm_customer_accounts(text)');
  IF signature IS NULL THEN RAISE EXCEPTION '기존 고객 조회 기능이 없습니다.'; END IF;
  definition := pg_get_functiondef(signature); source_hash := md5(definition);
  IF source_hash = customer_before THEN
    IF (length(definition)-length(replace(definition,customer_anchor,''))) / length(customer_anchor) <> 1 THEN
      RAISE EXCEPTION '고객 조회 코드의 적용 위치가 달라 중단했습니다.';
    END IF;
    EXECUTE replace(definition, customer_anchor, customer_replacement);
  ELSIF source_hash <> customer_after THEN
    RAISE EXCEPTION '고객 조회 코드가 확인한 원본과 달라 중단했습니다.';
  END IF;
  IF md5(pg_get_functiondef(signature)) <> customer_after THEN
    RAISE EXCEPTION '전체 고객 조회 제한 적용 검증에 실패했습니다.';
  END IF;
END $patch_branch_reads$;
