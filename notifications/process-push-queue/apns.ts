import { importPKCS8, SignJWT } from 'npm:jose@6.1.0';

let cached: { value: string; expires: number } | undefined;
async function authorization() {
  if (cached && cached.expires > Date.now()) return cached.value;
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const pem = Deno.env.get('APNS_PRIVATE_KEY');
  if (!keyId || !teamId || !pem) throw new Error('APNS_NOT_CONFIGURED');
  const key = await importPKCS8(pem.replaceAll('\\n', '\n'), 'ES256');
  const value = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId).setIssuedAt().sign(key);
  cached = { value, expires: Date.now() + 45 * 60 * 1000 };
  return value;
}
type Subscription = { token: string; activityStart?: string; activityUpdate?: string; activityAudience?: string };
type ActivityResult = { code: string; clearActivityUpdate?: string };
export type APNSResult = ActivityResult & { ok: boolean };
type Payload = { id: string; binding: string; category: string; alertDelivered?: boolean; customer?: { title: string; body: string; snapshot: { active: boolean; audience: string; phase: string; expiresAt?: number; [key: string]: unknown } }; booking?: { id?: string; pending: boolean; branch: string; schedule: string; customerName?: string; vehicleName?: string; vehiclePlate?: string; snapshot: { pendingCount: number; upcomingCount: number; [key: string]: unknown } } };
async function sendActivity(subscription: Subscription, payload: Payload, bearer: string): Promise<ActivityResult> {
  if (!payload.booking && !payload.customer) return { code: 'SKIPPED' };
  if (payload.customer && subscription.activityAudience !== 'customer') return { code: 'NO_ACTIVITY_TOKEN' };
  const state = payload.customer?.snapshot || payload.booking!.snapshot;
  const ended = payload.customer ? !payload.customer.snapshot.active || ['completed', 'cancelled'].includes(payload.customer.snapshot.phase) : Number(state.pendingCount) + Number(state.upcomingCount) === 0;
  const token = subscription.activityUpdate || (!ended ? subscription.activityStart : undefined);
  if (!token || !/^[a-f0-9]{64,256}$/.test(token)) return { code: 'NO_ACTIVITY_TOKEN' };
  const event = subscription.activityUpdate ? ended ? 'end' : 'update' : 'start';
  const timestamp = Math.floor(Date.now() / 1000);
  const aps: Record<string, unknown> = { timestamp, event, 'content-state': state, 'stale-date': timestamp + 300 };
  if (event === 'start') {
    aps['attributes-type'] = 'BookingActivityAttributes';
    aps.attributes = { binding: payload.binding };
    aps.alert = payload.customer ? { title: payload.customer.title, body: payload.customer.body } : { title: '프로모터스 예약', body: '예약 일정을 확인하세요.' };
  }
  if (ended) aps['dismissal-date'] = payload.customer?.snapshot.phase === 'completed' ? Math.max(timestamp, Math.min(timestamp + 7200, Number(state.expiresAt) || timestamp)) : timestamp;
  const response = await fetch(`https://api.push.apple.com/3/device/${token}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `bearer ${bearer}`, 'apns-topic': 'kr.promotors.app.push-type.liveactivity',
      'apns-push-type': 'liveactivity', 'apns-priority': '10', 'apns-expiration': String(timestamp + 300), 'content-type': 'application/json' },
    body: JSON.stringify({ aps })
  });
  const reason = response.status === 400 ? (await response.json().catch(() => ({}))).reason : undefined;
  const expired = response.status === 410 || response.status === 400 && ['BadDeviceToken', 'DeviceTokenNotForTopic'].includes(reason);
  const clear = subscription.activityUpdate === token && (event === 'end' && response.ok || expired);
  return { code: response.ok ? '200' : `ACTIVITY_${response.status}`, ...(clear ? { clearActivityUpdate: token } : {}) };
}
export async function sendAPNS(subscription: Subscription, payload: Payload): Promise<APNSResult> {
  if (!/^[a-f0-9]{64}$/.test(subscription.token)) return { ok: false, code: '410' };
  const bearer = await authorization();
  const booking = payload.booking;
  const vehicle = booking ? [booking.customerName, booking.vehicleName, booking.vehiclePlate].filter(Boolean).join(' · ') : '';
  const bookingBody = booking ? [booking.branch + ' · ' + booking.schedule, vehicle, '눌러서 예약 일정 확인'].filter(Boolean).join('\n') : '';
  // Production App Store transport; booking context is authorized and composed on the server.
  const response = payload.alertDelivered ? new Response(null, { status: 200 }) : await fetch(`https://api.push.apple.com/3/device/${subscription.token}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `bearer ${bearer}`, 'apns-topic': 'kr.promotors.app',
      'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': String(Math.floor(Date.now()/1000)+300),
      'apns-collapse-id': payload.id, 'content-type': 'application/json' },
    body: JSON.stringify({ aps: { alert: { title: payload.category === 'marketing' ? '(광고) 프로모터스' : booking?.pending ? '새 예약이 들어왔어요' : booking ? '예약 일정을 확인하세요' : payload.customer?.title || '프로모터스 알림',
      body: payload.category === 'marketing' ? '이벤트 안내가 있습니다. 수신거부: 앱 알림 설정' : booking ? bookingBody : payload.customer?.body || '새로운 안내가 도착했습니다. 앱에서 확인해 주세요.' }, sound: '02-precision-check.wav', ...(booking?.pending ? { category: 'PM_BOOKING_ACTIONS' } : {}) },
      id: payload.id, binding: payload.binding, ...(booking?.id ? { bookingId: booking.id } : {}) })
  });
  const reason = response.ok ? '' : (await response.json().catch(() => ({}))).reason;
  const activity: ActivityResult = response.ok ? await sendActivity(subscription, payload, bearer).catch(() => ({ code: 'ACTIVITY_TRANSPORT_ERROR' })) : { code: 'SKIPPED' };
  const feedback = activity.clearActivityUpdate ? { clearActivityUpdate: activity.clearActivityUpdate } : {};
  if (activity.code.startsWith('ACTIVITY_')) return { ok: false, code: `${activity.code}_ALERT_SENT`, ...feedback };
  return { ok: response.ok, code: ['Unregistered', 'BadDeviceToken', 'DeviceTokenNotForTopic'].includes(reason)
    ? '410' : response.ok ? activity.code === 'NO_ACTIVITY_TOKEN' ? '200_NO_ACTIVITY_TOKEN' : '200' : `APNS_${response.status}_${String(reason || 'ERROR').slice(0,40)}`, ...feedback };
}
