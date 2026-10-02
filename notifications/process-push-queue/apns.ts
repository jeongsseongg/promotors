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
export async function sendAPNS(subscription: { token: string }, payload: { id: string; binding: string; category: string }) {
  if (!/^[a-f0-9]{64}$/.test(subscription.token)) return { ok: false, code: '410' };
  const bearer = await authorization();
  // Production App Store transport. No customer data appears on a locked shared device.
  const response = await fetch(`https://api.push.apple.com/3/device/${subscription.token}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `bearer ${bearer}`, 'apns-topic': 'kr.promotors.app',
      'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': String(Math.floor(Date.now()/1000)+300),
      'apns-collapse-id': payload.id, 'content-type': 'application/json' },
    body: JSON.stringify({ aps: { alert: { title: payload.category === 'marketing' ? '(광고) 프로모터스' : '프로모터스 알림',
      body: payload.category === 'marketing' ? '이벤트 안내가 있습니다. 수신거부: 앱 알림 설정' : '새로운 안내가 도착했습니다. 앱에서 확인해 주세요.' }, sound: '02-precision-check.wav' },
      id: payload.id, binding: payload.binding })
  });
  const reason = response.ok ? '' : (await response.json().catch(() => ({}))).reason;
  return { ok: response.ok, code: ['Unregistered', 'BadDeviceToken', 'DeviceTokenNotForTopic'].includes(reason)
    ? '410' : response.ok ? '200' : `APNS_${response.status}_${String(reason || 'ERROR').slice(0,40)}` };
}
