import { importPKCS8, SignJWT } from 'npm:jose@6.1.0';

const PROJECT = 'promotors-8ddec', PACKAGE = 'kr.promotors.app', TTL = 300;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Subscription = { transport: string; token: string };
type Booking = { id?: string; pending?: boolean; branch?: string; schedule?: string; customerName?: string;
  vehicleName?: string; vehiclePlate?: string; snapshot?: Record<string, unknown> };
type Payload = { id: string; binding: string; category: string; booking?: Booking; customer?: unknown };
type Options = { validateOnly?: boolean; beforeSend?: () => Promise<boolean> };
let cached: { source: string; value: string; expires: number } | undefined;
let pending: { source: string; value: Promise<string> } | undefined;

function credentials() {
  const source = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  let account;
  try { account = JSON.parse(source || ''); } catch { throw new Error('FCM_NOT_CONFIGURED'); }
  if (account?.project_id !== PROJECT) throw new Error('FCM_PROJECT_MISMATCH');
  if (typeof account.client_email !== 'string' || !account.client_email.endsWith(`@${PROJECT}.iam.gserviceaccount.com`)
    || typeof account.private_key !== 'string' || !account.private_key) throw new Error('FCM_NOT_CONFIGURED');
  return { source: source!, account };
}

async function mint(account: { client_email: string; private_key: string }, source: string) {
  let assertion;
  try {
    const key = await importPKCS8(account.private_key.replaceAll('\\n', '\n'), 'RS256');
    assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(account.client_email)
      .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(key);
  } catch { throw new Error('FCM_NOT_CONFIGURED'); }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString()
  });
  if (!response.ok) throw new Error(`FCM_AUTH_${response.status}`);
  const data = await response.json().catch(() => ({}));
  if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 60)
    throw new Error('FCM_AUTH_INVALID_RESPONSE');
  cached = { source, value: data.access_token, expires: Date.now() + (Math.min(data.expires_in, 3600) - 60) * 1000 };
  return cached.value;
}

async function authorization() {
  const { source, account } = credentials();
  if (cached?.source === source && cached.expires > Date.now()) return cached.value;
  if (pending?.source === source) return pending.value;
  const current = { source, value: mint(account, source) }; pending = current;
  try { return await current.value; } finally { if (pending === current) pending = undefined; }
}

function clean(value: unknown, limit: number) {
  return typeof value === 'string' ? Array.from(value.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')).slice(0, limit).join('') : '';
}
function count(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? Math.min(9999, Math.max(0, Math.floor(value))) : 0; }
function bookingFields(value: Record<string, unknown>) {
  return { branch: clean(value.branch, 60), schedule: clean(value.schedule, 40), customerName: clean(value.customerName, 60),
    vehicleName: clean(value.vehicleName, 80), vehiclePlate: clean(value.vehiclePlate, 30) };
}
function bookingId(value: unknown) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || !value || value.length > 128 || /[^A-Za-z0-9:_-]/.test(value)) throw new Error('FCM_INVALID_PAYLOAD');
  return value;
}
function authorizedBooking(value: Booking) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('FCM_INVALID_PAYLOAD');
  const snapshot = value.snapshot && typeof value.snapshot === 'object' ? value.snapshot : {};
  return { id: bookingId(value.id), pending: value.pending === true, ...bookingFields(value as Record<string, unknown>),
    snapshot: { ...bookingFields(snapshot), bookingId: bookingId(snapshot.bookingId), pendingCount: count(snapshot.pendingCount),
      upcomingCount: count(snapshot.upcomingCount), startsAt: typeof snapshot.startsAt === 'number' && Number.isFinite(snapshot.startsAt)
        ? Math.max(0, Math.min(snapshot.startsAt, 4102444800)) : 0 } };
}

export function cleanCustomer(value: unknown) {
  const raw = value as {title?: unknown; body?: unknown; snapshot?: Record<string, unknown>};
  const s = raw?.snapshot;
  if (!s || s.audience !== 'customer' || !['confirmed', 'visit', 'repair', 'completed', 'cancelled'].includes(String(s.phase)) ||
    typeof s.active !== 'boolean' || typeof s.progress !== 'number' || !Number.isFinite(s.progress)) throw new Error('INVALID_CUSTOMER_CONTEXT');
  const record = (v: unknown) => {try {return bookingId(v);} catch {throw new Error('INVALID_CUSTOMER_CONTEXT');}};
  const snapshot = {audience: 'customer', active: s.active, phase: s.phase, bookingId: record(s.bookingId), runId: record(s.runId),
    ...bookingFields(s), customerName: '', pendingCount: 0, upcomingCount: 0, startsAt: typeof s.startsAt === 'number' && Number.isFinite(s.startsAt) ? Math.max(0, s.startsAt) : 0,
    stageLabel: clean(s.stageLabel, 50), progress: Math.min(100, Math.max(0, Math.floor(s.progress))),
    expiresAt: typeof s.expiresAt === 'number' && Number.isFinite(s.expiresAt) ? Math.max(0, s.expiresAt) : 0};
  return {title: clean(raw.title, 80), body: clean(raw.body, 240), snapshot};
}

function messageData(payload: Payload) {
  if (!payload || payload.id?.length !== 36 || payload.binding?.length !== 36 || !uuid.test(payload.id) || !uuid.test(payload.binding)
    || !['booking', 'repair', 'reminders', 'marketing', 'test'].includes(payload.category)) throw new Error('FCM_INVALID_PAYLOAD');
  const booking = payload.booking ? authorizedBooking(payload.booking) : null;
  const customer = payload.customer ? cleanCustomer(payload.customer) : null;
  const title = payload.category === 'marketing' ? '(광고) 프로모터스' : booking?.pending ? '새 예약이 들어왔어요'
    : booking ? '예약 일정을 확인하세요' : customer?.title || '프로모터스 알림';
  const vehicle = booking ? [booking.customerName, booking.vehicleName, booking.vehiclePlate].filter(Boolean).join(' · ') : '';
  const body = payload.category === 'marketing' ? '이벤트 안내가 있습니다. 수신거부: 앱 알림 설정'
    : booking ? [booking.branch + ' · ' + booking.schedule, vehicle, '눌러서 예약 일정 확인'].filter(Boolean).join('\n')
    : customer?.body || '새로운 안내가 도착했습니다. 앱에서 확인해 주세요.';
  const issuedAt = Math.floor(Date.now() / 1000);
  const data: Record<string, string> = { id: payload.id, binding: payload.binding, category: payload.category,
    issuedAt: String(issuedAt), expiresAt: String(issuedAt + TTL), title, body: Array.from(body).slice(0, 240).join('') };
  if (booking) data.booking = JSON.stringify(booking);
  if (customer) data.customer = JSON.stringify(customer);
  if (new TextEncoder().encode(JSON.stringify(data)).length > 4096) data.body = Array.from(body).slice(0, 120).join('');
  if (new TextEncoder().encode(JSON.stringify(data)).length > 4096) throw new Error('FCM_PAYLOAD_TOO_LARGE');
  return data;
}

function failure(status: number, error: unknown) {
  const response = error as { error?: { status?: unknown; details?: { '@type'?: string; errorCode?: unknown }[] } };
  const detail = Array.isArray(response?.error?.details) ? response.error.details.find(value =>
    value?.['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError') : undefined;
  if (status === 404 && detail?.errorCode === 'UNREGISTERED') return '410';
  const reason = detail?.errorCode || response?.error?.status;
  return `FCM_${status}_${typeof reason === 'string' && /^[A-Z_]{1,50}$/.test(reason) ? reason : 'ERROR'}`;
}

export async function sendFCM(subscription: Subscription, payload: Payload, options: Options = {}) {
  if (subscription.transport !== 'fcm' || typeof subscription.token !== 'string' || subscription.token.length < 32
    || subscription.token.length > 4096 || /[^!-~]/.test(subscription.token)) throw new Error('FCM_INVALID_TOKEN');
  const data = messageData(payload);
  const bearer = await authorization();
  if (options.beforeSend && !await options.beforeSend()) return { ok: false, cancelled: true, code: 'REVOKED' };
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(options.validateOnly ? { validate_only: true } : {}), message: {
      token: subscription.token, data, android: { ttl: `${TTL}s`, priority: payload.category === 'marketing' ? 'NORMAL' : 'HIGH',
        restricted_package_name: PACKAGE, direct_boot_ok: false }
    } })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, code: failure(response.status, result) };
  if (options.validateOnly) return { ok: true, code: 'FCM_VALIDATED', validatedOnly: true };
  return typeof result.name === 'string' && result.name.startsWith(`projects/${PROJECT}/messages/`)
    ? { ok: true, code: '200' } : { ok: false, code: 'FCM_INVALID_RESPONSE' };
}
