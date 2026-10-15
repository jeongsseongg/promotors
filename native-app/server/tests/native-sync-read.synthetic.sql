BEGIN;
-- Synthetic rows only; no application table reads, logins, uploads or sends.
CREATE TEMP TABLE native_sync_qa_input (payload jsonb);
CREATE TEMP TABLE native_sync_qa_calls (token text);
CREATE TEMP TABLE native_sync_qa_results (scenario text, passed boolean);
CREATE FUNCTION pg_temp.native_sync_guard(p_token text) RETURNS jsonb LANGUAGE plpgsql AS $guard$
BEGIN
  INSERT INTO pg_temp.native_sync_qa_calls VALUES (p_token);
  IF p_token = 'qa-expired' THEN RAISE EXCEPTION 'INVALID_SESSION'; END IF;
  IF p_token = 'qa-privacy-denied' THEN RAISE EXCEPTION 'PRIVACY_EPOCH_CHANGED'; END IF;
  RETURN (SELECT payload FROM pg_temp.native_sync_qa_input);
END
$guard$;
CREATE OR REPLACE FUNCTION pg_temp.pm_native_sync_read_test(p_token text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
WITH input AS MATERIALIZED (SELECT pg_temp.native_sync_guard(p_token) AS rows),
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
CREATE FUNCTION pg_temp.native_qa_payload(p_rows jsonb, p_key text) RETURNS jsonb LANGUAGE sql AS $qa$
  SELECT entry->'payload' FROM jsonb_array_elements(p_rows) AS entries(entry) WHERE entry->>'data_key'=p_key
$qa$;
CREATE FUNCTION pg_temp.native_qa_assert(p_pass boolean, p_name text) RETURNS void LANGUAGE plpgsql AS $qa$
BEGIN
  IF p_pass IS DISTINCT FROM true THEN RAISE EXCEPTION 'NATIVE_SYNC_SYNTHETIC_FAILED: %', p_name; END IF;
  INSERT INTO pg_temp.native_sync_qa_results VALUES (p_name,true);
END
$qa$;
DO $tests$
DECLARE
  snapshots jsonb; output jsonb; source jsonb; context jsonb;
  credentials text[] := ARRAY['password','password_hash','passwordHash','token','sessionToken'];
  profile jsonb := '{"id":"qa-admin","developer":true,"name":"Synthetic person","password":"qa-password","password_hash":"qa-hash","passwordHash":"qa-hash","token":"qa-profile-token","sessionToken":"qa-session"}';
  key text; count_before bigint; caught boolean;
BEGIN
  snapshots := '[
    {"data_key":"pm-privacy-epoch","payload":{"epoch":77}},
    {"data_key":"pm-branches","payload":[{"name":"QA-A"},{"name":"QA-B"}]},
    {"data_key":"pm-notices","payload":[{"title":"Synthetic","body":"password and token are editorial words","password":"public metadata must remain"}]},
    {"data_key":"pm-auth-context","payload":{"authenticated":true,"role":"general","branches":["QA-A"],"profile":{}}},
    {"data_key":"pm-bookings","payload":[
      {"id":"booking-a","branch":"QA-A","memberId":"member-a","customer":{"id":"member-a","password":"qa-nested"}},
      {"id":"booking-b","branch":"QA-B","memberId":"member-b"},
      {"id":"booking-a-other-branch","branch":"QA-B","memberId":"member-a"},
      {"id":"booking-conflict","branch":"QA-A","memberId":"owner-x","customer":{"id":"owner-y"}},
      {"id":"booking-missing-branch","memberId":"member-hidden"},
      {"id":"booking-empty-branch","branch":"","memberId":"member-empty"}]},
    {"data_key":"pm-service-runs","payload":[
      {"id":"run-a","branch":"QA-A","memberId":"member-a","customer":{"id":"member-a","token":"qa-nested"}},
      {"id":"run-b","branch":"QA-B","memberId":"member-b"},
      {"id":"run-embedded","branch":"QA-A","customer":{"id":"member-embedded"}}]},
    {"data_key":"pm-work-audit","payload":[{"id":"audit-a","branch":"QA-A"},{"id":"audit-b","branch":"QA-B"},{"id":"audit-unassigned"}]},
    {"data_key":"pm-messages","payload":[
      {"id":"message-a","memberId":"member-a","customer":{"id":"member-a","passwordHash":"qa-nested"},"message":"Keep password word in text"},
      {"id":"message-b","memberId":"member-b"},
      {"id":"message-b-explicit","memberId":"member-a","branch":"QA-B"},
      {"id":"message-b-context","memberId":"member-a","serviceContext":{"branch":"QA-B"}},
      {"id":"message-a-explicit","memberId":"member-a","branch":"QA-A","serviceContext":{"branch":"QA-A"}},
      {"id":"message-conflict","memberId":"member-a","customer":{"id":"member-b"}},
      {"id":"message-embedded","customer":{"id":"member-embedded"}},
      {"id":"message-conflicting-work","memberId":"owner-x"},
      {"id":"message-unlinked","memberId":"member-hidden"},
      {"id":"message-car-only","car":"QA-CAR"},
      {"id":"message-bad-branch","memberId":"member-a","branch":null}]},
    {"data_key":"pm-members","payload":[]},
    {"data_key":"pm-customers","payload":{}},
    {"data_key":"pm-banned-members","payload":[{"id":"restriction","member":{"id":"member-b","password":"qa-nested"}}]},
    {"data_key":"pm-admin-notifications","payload":[{"id":"global-notification"}]},
    {"data_key":"pm-branch-transfer-requests","payload":[{"id":"global-transfer"}]}
  ]'::jsonb;
  snapshots := jsonb_set(snapshots,'{3,payload,profile}',profile);
  snapshots := jsonb_set(snapshots,'{8,payload}',jsonb_build_array(profile));
  snapshots := jsonb_set(snapshots,'{9,payload}',jsonb_build_object('QA-CAR',profile||'{"memo":"Keep password text","records":[{"service":"Synthetic repair"}]}'::jsonb));
  INSERT INTO pg_temp.native_sync_qa_input VALUES(snapshots);
  output := pg_temp.pm_native_sync_read_test('qa-general');
  PERFORM pg_temp.native_qa_assert((SELECT count(*)=1 FROM pg_temp.native_sync_qa_calls),'delegates_once');
  PERFORM pg_temp.native_qa_assert(jsonb_array_length(pg_temp.native_qa_payload(output,'pm-bookings'))=2
    AND jsonb_array_length(pg_temp.native_qa_payload(output,'pm-service-runs'))=2
    AND pg_temp.native_qa_payload(output,'pm-work-audit')='[{"id":"audit-a","branch":"QA-A"}]'::jsonb,'general_assigned_branch_only');
  PERFORM pg_temp.native_qa_assert((SELECT array_agg(x->>'id') FROM jsonb_array_elements(pg_temp.native_qa_payload(output,'pm-messages')) x)
    = ARRAY['message-a','message-a-explicit','message-embedded'],'general_exact_owner_and_message_branch');
  PERFORM pg_temp.native_qa_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(output) x WHERE x->>'data_key' IN
    ('pm-members','pm-customers','pm-banned-members','pm-admin-notifications','pm-branch-transfer-requests')),'general_global_directories_absent');
  PERFORM pg_temp.native_qa_assert(pg_temp.native_qa_payload(output,'pm-notices')=pg_temp.native_qa_payload(snapshots,'pm-notices')
    AND pg_temp.native_qa_payload(output,'pm-branches')=pg_temp.native_qa_payload(snapshots,'pm-branches'),'public_content_unchanged');
  PERFORM pg_temp.native_qa_assert(pg_temp.native_qa_payload(output,'pm-privacy-epoch')='{"epoch":77}'::jsonb
    AND pg_temp.native_qa_payload(output,'pm-auth-context')->>'role'='general','privacy_epoch_and_auth_preserved');
  PERFORM pg_temp.native_qa_assert(NOT (pg_temp.native_qa_payload(output,'pm-bookings')->0->'customer') ? 'password'
    AND NOT (pg_temp.native_qa_payload(output,'pm-service-runs')->0->'customer') ? 'token'
    AND NOT (pg_temp.native_qa_payload(output,'pm-messages')->0->'customer') ? 'passwordHash','embedded_profiles_scrubbed');
  UPDATE pg_temp.native_sync_qa_input SET payload=jsonb_set(snapshots,'{3,payload,branches}','[]'::jsonb);
  output := pg_temp.pm_native_sync_read_test('qa-empty');
  PERFORM pg_temp.native_qa_assert(pg_temp.native_qa_payload(output,'pm-bookings')='[]'::jsonb
    AND pg_temp.native_qa_payload(output,'pm-service-runs')='[]'::jsonb
    AND pg_temp.native_qa_payload(output,'pm-work-audit')='[]'::jsonb
    AND pg_temp.native_qa_payload(output,'pm-messages')='[]'::jsonb,'general_no_branch_has_no_private_rows');
  UPDATE pg_temp.native_sync_qa_input SET payload=jsonb_set(snapshots,'{3,payload,branches}','null'::jsonb);
  output := pg_temp.pm_native_sync_read_test('qa-malformed-branch');
  PERFORM pg_temp.native_qa_assert(pg_temp.native_qa_payload(output,'pm-bookings')='[]'::jsonb
    AND pg_temp.native_qa_payload(output,'pm-messages')='[]'::jsonb,'general_malformed_branch_fails_closed');
  UPDATE pg_temp.native_sync_qa_input SET payload=jsonb_set(snapshots,'{3,payload,role}','"main"'::jsonb);
  output := pg_temp.pm_native_sync_read_test('qa-main');
  PERFORM pg_temp.native_qa_assert(jsonb_array_length(output)=jsonb_array_length(snapshots)
    AND jsonb_array_length(pg_temp.native_qa_payload(output,'pm-bookings'))=6,'main_keeps_existing_rows');
  FOREACH key IN ARRAY credentials LOOP
    PERFORM pg_temp.native_qa_assert(NOT (pg_temp.native_qa_payload(output,'pm-auth-context')->'profile') ? key
      AND NOT (pg_temp.native_qa_payload(output,'pm-members')->0) ? key
      AND NOT (pg_temp.native_qa_payload(output,'pm-customers')->'QA-CAR') ? key,'credential_'||key||'_removed');
  END LOOP;
  PERFORM pg_temp.native_qa_assert(pg_temp.native_qa_payload(output,'pm-auth-context')->'profile'->'developer'='true'::jsonb
    AND pg_temp.native_qa_payload(output,'pm-auth-context')->>'role'='main'
    AND pg_temp.native_qa_payload(output,'pm-customers')->'QA-CAR'->>'memo'='Keep password text'
    AND jsonb_array_length(pg_temp.native_qa_payload(output,'pm-customers')->'QA-CAR'->'records')=1,'developer_flag_and_customer_notes_preserved');
  context := '{"authenticated":true,"role":"customer","branches":[],"profile":{"id":"member-a","password":"qa-only"}}';
  source := jsonb_build_array(snapshots->0,snapshots->1,snapshots->2,jsonb_build_object('data_key','pm-auth-context','payload',context),
    jsonb_build_object('data_key','pm-bookings','payload',jsonb_build_array(snapshots#>'{4,payload,0}',snapshots#>'{4,payload,2}')),
    jsonb_build_object('data_key','pm-service-runs','payload',jsonb_build_array(snapshots#>'{5,payload,0}')),
    jsonb_build_object('data_key','pm-customers','payload','{}'::jsonb));
  UPDATE pg_temp.native_sync_qa_input SET payload=source;
  output := pg_temp.pm_native_sync_read_test('qa-customer');
  PERFORM pg_temp.native_qa_assert(jsonb_array_length(output)=jsonb_array_length(source)
    AND jsonb_array_length(pg_temp.native_qa_payload(output,'pm-bookings'))=2
    AND pg_temp.native_qa_payload(output,'pm-customers')='{}'::jsonb,'customer_keeps_upstream_scoped_snapshot');
  UPDATE pg_temp.native_sync_qa_input SET payload=jsonb_set(snapshots,'{3,payload}','{"authenticated":false}'::jsonb);
  output := pg_temp.pm_native_sync_read_test(NULL);
  PERFORM pg_temp.native_qa_assert(jsonb_array_length(output)=4
    AND pg_temp.native_qa_payload(output,'pm-bookings') IS NULL
    AND pg_temp.native_qa_payload(output,'pm-auth-context')='{"authenticated":false}'::jsonb,'guest_and_invalid_session_no_private_rows');
  UPDATE pg_temp.native_sync_qa_input SET payload=jsonb_set(source,'{0,payload,epoch}','78'::jsonb);
  output := pg_temp.pm_native_sync_read_test('qa-customer');
  PERFORM pg_temp.native_qa_assert(pg_temp.native_qa_payload(output,'pm-privacy-epoch')='{"epoch":78}'::jsonb,'changed_epoch_not_cached');
  caught:=false;
  BEGIN PERFORM pg_temp.pm_native_sync_read_test('qa-expired'); EXCEPTION WHEN OTHERS THEN caught:=SQLERRM='INVALID_SESSION'; END;
  PERFORM pg_temp.native_qa_assert(caught,'upstream_session_denial_propagates');
  caught:=false;
  BEGIN PERFORM pg_temp.pm_native_sync_read_test('qa-privacy-denied'); EXCEPTION WHEN OTHERS THEN caught:=SQLERRM='PRIVACY_EPOCH_CHANGED'; END;
  PERFORM pg_temp.native_qa_assert(caught,'upstream_privacy_denial_propagates');
END
$tests$;
SELECT scenario, passed FROM pg_temp.native_sync_qa_results ORDER BY scenario;
ROLLBACK;
