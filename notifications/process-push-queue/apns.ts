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
type Subscription = { token: string; activityStart?: string; activityUpdate?: string };
type Payload = { id: string; binding: string; category: string; alertDelivered?: boolean; booking?: { id?: string; pending: boolean; branch: string; schedule: string; customerName?: string; vehicleName?: string; vehiclePlate?: string; snapshot: { pendingCount: number; upcomingCount: number; [key: string]: unknown } } };
async function sendActivity(subscription: Subscription, payload: Payload, bearer: string) {
  if (!payload.booking) return 'SKIPPED';
  const state = payload.booking.snapshot;
  const ended = state.pendingCount + state.upcomingCount === 0;
  const token = subscription.activityUpdate || (!ended ? subscription.activityStart : undefined);
  if (!token || !/^[a-f0-9]{64,256}$/.test(token)) return 'NO_ACTIVITY_TOKEN';
  const event = subscription.activityUpdate ? ended ? 'end' : 'update' : 'start';
  const timestamp = Math.floor(Date.now() / 1000);
  const aps: Record<string, unknown> = { timestamp, event, 'content-state': state, 'stale-date': timestamp + 300 };
  if (event === 'start') {
    aps['attributes-type'] = 'BookingActivityAttributes';
    aps.attributes = { binding: payload.binding };
    aps.alert = { title: '프로모터스 예약', body: '예약 일정을 확인하세요.' };
  }
  if (ended) aps['dismissal-date'] = timestamp;
  const response = await fetch(`https://api.push.apple.com/3/device/${token}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `bearer ${bearer}`, 'apns-topic': 'kr.promotors.app.push-type.liveactivity',
      'apns-push-type': 'liveactivity', 'apns-priority': '10', 'apns-expiration': String(timestamp + 300), 'content-type': 'application/json' },
    body: JSON.stringify({ aps })
  });
  return response.ok ? '200' : `ACTIVITY_${response.status}`;
}
export async function sendAPNS(subscription: Subscription, payload: Payload) {
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
    body: JSON.stringify({ aps: { alert: { title: payload.category === 'marketing' ? '(광고) 프로모터스' : booking?.pending ? '새 예약이 들어왔어요' : booking ? '예약 일정을 확인하세요' : '프로모터스 알림',
      body: payload.category === 'marketing' ? '이벤트 안내가 있습니다. 수신거부: 앱 알림 설정' : booking ? bookingBody : '새로운 안내가 도착했습니다. 앱에서 확인해 주세요.' }, sound: '02-precision-check.wav', ...(booking?.pending ? { category: 'PM_BOOKING_ACTIONS' } : {}) },
      id: payload.id, binding: payload.binding, ...(booking?.id ? { bookingId: booking.id } : {}) })
  });
  const reason = response.ok ? '' : (await response.json().catch(() => ({}))).reason;
  const activityCode = response.ok ? await sendActivity(subscription, payload, bearer).catch(() => 'ACTIVITY_TRANSPORT_ERROR') : 'SKIPPED';
  if (activityCode.startsWith('ACTIVITY_')) return { ok: false, code: `${activityCode}_ALERT_SENT` };
  return { ok: response.ok, code: ['Unregistered', 'BadDeviceToken', 'DeviceTokenNotForTopic'].includes(reason)
    ? '410' : response.ok ? activityCode === 'NO_ACTIVITY_TOKEN' ? '200_NO_ACTIVITY_TOKEN' : '200' : `APNS_${response.status}_${String(reason || 'ERROR').slice(0,40)}` };
}
