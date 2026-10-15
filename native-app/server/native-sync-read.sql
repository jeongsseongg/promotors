-- Native clients only. The existing web RPC and stored data remain unchanged.
-- pm_sync_read remains the authority for sessions, expiry and privacy locking.
CREATE OR REPLACE FUNCTION public.pm_native_sync_read(p_token text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
WITH input AS MATERIALIZED (SELECT public.pm_sync_read(p_token) AS rows),
rows AS MATERIALIZED (
  SELECT row, position FROM input, jsonb_array_elements(input.rows) WITH ORDINALITY AS entry(row, position)
), context AS MATERIALIZED (
  SELECT row->'payload' AS auth FROM rows WHERE row->>'data_key' = 'pm-auth-context'
), settings AS (
  SELECT auth, ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(auth->'branches') = 'array'
    THEN auth->'branches' ELSE '[]'::jsonb END)) AS branches,
    ARRAY['password','password_hash','passwordHash','token','sessionToken']::text[] AS credentials FROM context
), work AS MATERIALIZED (
  SELECT item FROM rows CROSS JOIN settings CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(row->'payload') = 'array' THEN row->'payload' ELSE '[]'::jsonb END) AS items(item)
  WHERE row->>'data_key' IN ('pm-bookings','pm-service-runs') AND jsonb_typeof(item->'branch') = 'string'
    AND item->>'branch' <> '' AND item->>'branch' = ANY(settings.branches)
), owners AS (
  SELECT DISTINCT coalesce(nullif(item->>'memberId',''), nullif(item#>>'{customer,id}','')) AS id FROM work
  WHERE coalesce(nullif(item->>'memberId',''), nullif(item#>>'{customer,id}','')) IS NOT NULL
    AND (nullif(item->>'memberId','') IS NULL OR nullif(item#>>'{customer,id}','') IS NULL
      OR item->>'memberId' = item#>>'{customer,id}')
), visible AS (
  SELECT row, position, settings.* FROM rows CROSS JOIN settings
  WHERE row->>'data_key' IN ('pm-privacy-epoch','pm-auth-context','pm-branches','pm-notices','promotors-cases',
    'pm-products','pm-blocked','pm-blog-settings','pm-intro-slides','pm-home-view','pm-event-banners')
    OR (auth->'authenticated' = 'true'::jsonb AND (auth->>'role' IN ('main','customer')
      OR (auth->>'role' = 'general' AND row->>'data_key' IN ('pm-bookings','pm-service-runs','pm-work-audit','pm-messages'))))
), filtered AS (
  SELECT row, position, credentials, CASE WHEN auth->>'role' = 'general' AND row->>'data_key'
    IN ('pm-bookings','pm-service-runs','pm-work-audit','pm-messages') THEN coalesce((
      SELECT jsonb_agg(item ORDER BY ordinal) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(row->'payload') = 'array'
        THEN row->'payload' ELSE '[]'::jsonb END) WITH ORDINALITY AS items(item, ordinal)
      WHERE CASE WHEN row->>'data_key' = 'pm-messages' THEN
        coalesce(nullif(item->>'memberId',''), nullif(item#>>'{customer,id}','')) IN (SELECT id FROM owners)
        AND (nullif(item->>'memberId','') IS NULL OR nullif(item#>>'{customer,id}','') IS NULL OR item->>'memberId' = item#>>'{customer,id}')
        AND (NOT item ? 'branch' OR (jsonb_typeof(item->'branch') = 'string' AND item->>'branch' = ANY(branches)))
        AND (NOT coalesce(item->'serviceContext','{}'::jsonb) ? 'branch' OR
          (jsonb_typeof(item#>'{serviceContext,branch}') = 'string' AND item#>>'{serviceContext,branch}' = ANY(branches)))
      ELSE jsonb_typeof(item->'branch') = 'string' AND item->>'branch' <> '' AND item->>'branch' = ANY(branches) END
    ), '[]'::jsonb) ELSE row->'payload' END AS payload FROM visible
), safe AS (
  SELECT row, position, CASE
    WHEN row->>'data_key' = 'pm-auth-context' AND jsonb_typeof(payload->'profile') = 'object'
      THEN jsonb_set(payload, '{profile}', (payload->'profile') - credentials)
    WHEN row->>'data_key' = 'pm-customers' AND jsonb_typeof(payload) = 'object'
      THEN coalesce((SELECT jsonb_object_agg(key, CASE WHEN jsonb_typeof(value) = 'object' THEN value - credentials ELSE value END)
        FROM jsonb_each(payload)), '{}'::jsonb)
    WHEN row->>'data_key' IN ('pm-members','pm-bookings','pm-service-runs','pm-messages','pm-banned-members') AND jsonb_typeof(payload) = 'array'
      THEN coalesce((SELECT jsonb_agg(CASE WHEN jsonb_typeof(item) = 'object' THEN (CASE WHEN row->>'data_key' = 'pm-members' THEN item - credentials ELSE item END)
        || CASE WHEN jsonb_typeof(item->'customer') = 'object' THEN jsonb_build_object('customer', (item->'customer') - credentials) ELSE '{}'::jsonb END
        || CASE WHEN jsonb_typeof(item->'member') = 'object' THEN jsonb_build_object('member', (item->'member') - credentials) ELSE '{}'::jsonb END ELSE item END ORDER BY ordinal)
        FROM jsonb_array_elements(payload) WITH ORDINALITY AS items(item, ordinal)), '[]'::jsonb)
    ELSE payload END AS payload FROM filtered
)
SELECT coalesce(jsonb_agg(jsonb_set(row, '{payload}', payload) ORDER BY position), '[]'::jsonb) FROM safe;
$function$;
REVOKE ALL ON FUNCTION public.pm_native_sync_read(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_native_sync_read(text) TO anon, authenticated;
COMMENT ON FUNCTION public.pm_native_sync_read(text) IS 'Native session snapshot: delegates auth/privacy to pm_sync_read; scopes general branches before HTTP; removes exact profile credential keys.';
