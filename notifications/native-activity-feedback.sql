-- Internal delivery feedback only. Never revoke an ordinary APNs device token.
CREATE OR REPLACE FUNCTION public.pm_push_activity_clear(p_id uuid, p_lease uuid, p_expected_update text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE changed integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_expected_update IS NULL OR length(p_expected_update) NOT BETWEEN 64 AND 256 OR p_expected_update !~ '^[a-f0-9]+$'
    THEN RAISE EXCEPTION 'INVALID_DEVICE'; END IF;
  IF NOT coalesce((public.pm_push_worker('validate', jsonb_build_object('id', p_id, 'leaseId', p_lease))->>'valid')::boolean, false)
    THEN RETURN jsonb_build_object('ok', false, 'cleared', false, 'code', 'REVOKED'); END IF;
  UPDATE public.pm_push_devices d SET subscription = d.subscription - 'activityUpdate'
  FROM public.pm_push_deliveries q JOIN public.pm_push_inbox i ON i.id = q.notification_id
  WHERE q.id = p_id AND q.lease_id = p_lease AND q.status = 'sending' AND q.lease_until > now()
    AND q.device_id = d.device_id AND q.binding = d.binding AND d.login_id = i.login_id
    AND d.revoked_at IS NULL AND d.subscription->>'transport' = 'apns'
    AND d.subscription->>'activityUpdate' = p_expected_update;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'cleared', changed = 1);
END
$function$;
REVOKE ALL ON FUNCTION public.pm_push_activity_clear(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_push_activity_clear(uuid,uuid,text) TO service_role;
