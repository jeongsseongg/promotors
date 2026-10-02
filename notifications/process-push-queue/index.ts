import { sendAPNS } from './apns.ts';
import webpush from 'npm:web-push@3.6.7';

const base = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(action: string, data: Record<string, unknown> = {}) {
  const res = await fetch(`${base}/rest/v1/rpc/pm_push_worker`, {
    method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_action: action, p_data: data }),
  });
  if (!res.ok) throw new Error(`PUSH_RPC_${res.status}`);
  return await res.json();
}
async function equalSecret(a: string, b: string) {
  const encode = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [x, y] = await Promise.all([encode(a), encode(b)]);
  return new Uint8Array(x).reduce((diff, byte, i) => diff | (byte ^ new Uint8Array(y)[i]), 0) === 0;
}
function response(status: number, data: unknown) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
async function deliver(row: any, config: any) {
  const ack = { id: row.id, leaseId: row.leaseId };
  if (!(await rpc('validate', ack)).valid) return rpc('ack', { ...ack, result: 'cancelled', code: 'REVOKED' });
  try {
    if (row.subscription.transport === 'apns') {
      const result = await sendAPNS(row.subscription, row.payload);
      await rpc('ack', { ...ack, result: result.ok ? 'sent' : 'failed', code: result.code });
      return;
    }
    const request = webpush.generateRequestDetails(row.subscription, JSON.stringify(row.payload), {
      vapidDetails: { subject: config.subject, publicKey: config.public_key, privateKey: config.private_key },
      TTL: 300, urgency: 'normal', topic: row.payload.id.replaceAll('-', '').slice(0, 32),
    });
    // Native fetch works on the Edge runtime without Node HTTP socket compatibility.
    const res = await fetch(request.endpoint, { method: 'POST', headers: request.headers, body: request.body,
      redirect: 'error', signal: AbortSignal.timeout(15000) });
    await rpc('ack', { ...ack, result: res.ok ? 'sent' : 'failed', code: String(res.status) });
  } catch (error) {
    await rpc('ack', { ...ack, result: 'failed', code: error instanceof Error && error.message === 'APNS_NOT_CONFIGURED' ? 'APNS_NOT_CONFIGURED' : error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'PUSH_TRANSPORT_ERROR' });
  }
}
Deno.serve(async (req) => {
  const traceId = crypto.randomUUID();
  if (req.method !== 'POST') return response(405, { code: 'METHOD_NOT_ALLOWED', traceId });
  const secret = req.headers.get('x-push-secret');
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) return response(401, { code: 'UNAUTHORIZED', traceId });
  try {
    let config = await rpc('config');
    if (!await equalSecret(secret, config.job_secret)) return response(401, { code: 'UNAUTHORIZED', traceId });
    if (!config.public_key) {
      await rpc('initialize', webpush.generateVAPIDKeys());
      config = await rpc('config');
    }
    const rows = await rpc('claim');
    for (let i = 0; i < rows.length; i += 5) await Promise.all(rows.slice(i, i + 5).map((row: any) => deliver(row, config)));
    return response(200, { processed: rows.length, traceId });
  } catch (error) {
    const code = error instanceof Error && /^PUSH_RPC_\d+$/.test(error.message) ? error.message : 'PUSH_WORKER_ERROR';
    console.error(JSON.stringify({ traceId, code }));
    return response(500, { code, traceId });
  }
});
