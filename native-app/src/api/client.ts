import { ApiError, responseError, requireValue } from './errors';
import type { SessionSnapshot } from '../domain/types';

export const PROMOTORS_SERVER = 'https://ytigiculewerivyytxza.supabase.co';
export const NATIVE_SOURCE = 'promotors-native://app';
export const NATIVE_SYNC_RPC = 'pm_native_sync_read';
export type RpcName = 'pm_login' | 'pm_admin_login' | 'pm_register' | 'pm_logout' | 'pm_sync_read'
  | 'pm_native_sync_read' | 'pm_is_developer' | 'pm_customer_activity'
  | 'pm_sync_write' | 'pm_sync_merge_by_id' | 'pm_member_booking_create' | 'pm_booking_availability'
  | 'pm_branch_hours_read' | 'pm_admin_booking_actions' | 'pm_notifications' | 'pm_native_push_subscribe'
  | 'pm_account_deletion' | 'pm_deletion_receipt' | 'pm_asset_get' | 'pm_change_password'
  | 'pm_guest_booking_create_v2' | 'pm_guest_booking_lookup' | 'pm_guest_booking_cancel'
  | 'pm_messages_read' | 'pm_promo_read' | 'pm_coupon_use' | 'pm_event_enter' | 'pm_promo_write'
  | 'pm_branch_hours_write' | 'pm_customer_accounts' | 'pm_admin_accounts' | 'pm_branch_admin_login' | 'pm_branch_admin_manage';
export interface Credentials { token: string | null; state: SessionSnapshot }
interface SessionHooks {
  credentials(): Credentials;
  ensureReady(): Promise<void>;
  invalidate(code: string): Promise<void>;
}
export interface RpcOptions { authenticated?: boolean; skipReadiness?: boolean; allowDetached?: boolean }
export interface FetchResponse {
  ok: boolean; status: number; text(): Promise<string>;
  headers?: { get(name: string): string | null };
}
export type FetchLike = (url: string, init: {
  method: string; headers: Record<string, string>; body?: string | Uint8Array; signal?: AbortSignal;
}) => Promise<FetchResponse>;
export interface ApiClientOptions { supabaseUrl: string; publicAnonKey: string; fetch?: FetchLike; timeoutMs?: number }

const signedIn = new Set<RpcName>(['pm_sync_write', 'pm_sync_merge_by_id', 'pm_member_booking_create',
  'pm_admin_booking_actions', 'pm_notifications', 'pm_native_push_subscribe', 'pm_customer_activity', 'pm_account_deletion',
  'pm_change_password', 'pm_messages_read', 'pm_promo_read', 'pm_coupon_use', 'pm_event_enter',
  'pm_promo_write', 'pm_branch_hours_write', 'pm_customer_accounts', 'pm_admin_accounts', 'pm_branch_admin_manage']);
const epochRequired = new Set<RpcName>(['pm_sync_write', 'pm_sync_merge_by_id', 'pm_member_booking_create',
  'pm_register', 'pm_guest_booking_create_v2', 'pm_guest_booking_cancel', 'pm_change_password',
  'pm_admin_booking_actions', 'pm_native_push_subscribe', 'pm_customer_activity', 'pm_coupon_use', 'pm_event_enter', 'pm_promo_write', 'pm_branch_hours_write', 'pm_branch_admin_manage']);
function validateConfig(options: ApiClientOptions) {
  if (options.supabaseUrl.replace(/\/$/, '') !== PROMOTORS_SERVER || !options.publicAnonKey) throw new ApiError('API_CONFIG_INVALID');
  const key = options.publicAnonKey;
  if (key.startsWith('sb_publishable_')) return;
  if (key.split('.').length !== 3) throw new ApiError('API_CONFIG_INVALID');
  try {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let bits = 0, value = 0, decoded = '';
    for (const ch of key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/').replace(/=/g, '')) {
      const digit = chars.indexOf(ch); if (digit < 0) throw new Error();
      value = (value << 6) | digit; bits += 6;
      if (bits >= 8) { bits -= 8; decoded += String.fromCharCode((value >> bits) & 255); }
    }
    const payload = JSON.parse(decoded);
    if (payload.role !== 'anon' || payload.ref !== 'ytigiculewerivyytxza') throw new Error();
  } catch { throw new ApiError('API_CONFIG_INVALID'); }
}
class NativeRpcClient {
  readonly config = { supabaseUrl: PROMOTORS_SERVER };
  private hooks?: SessionHooks;
  private readonly send: FetchLike;
  constructor(private options: ApiClientOptions) { validateConfig(options); this.send = options.fetch || (globalThis.fetch as FetchLike); }
  setSessionHooks(value: SessionHooks) { this.hooks = value; }
  private async request(path: string, params: Record<string, unknown> | Uint8Array, headers: Record<string, string>) {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), this.options.timeoutMs || 20000);
    try {
      const response = await this.send(`${PROMOTORS_SERVER}${path}`, {
        method: 'POST', headers: { apikey: this.options.publicAnonKey, Authorization: `Bearer ${this.options.publicAnonKey}`,
          'Content-Type': 'application/json', ...headers }, body: params instanceof Uint8Array ? params : JSON.stringify(params), signal: abort.signal,
      });
      let body: unknown;
      try { body = JSON.parse(await response.text()); } catch { throw new ApiError('INVALID_RESPONSE', { status: response.status }); }
      const trace = response.headers?.get('x-request-id') || response.headers?.get('sb-request-id') || undefined;
      if (!response.ok || (body && typeof body === 'object' && 'ok' in body && body.ok === false)) throw responseError(body, response.status, trace);
      return body;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(abort.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  private assertCurrent(captured: Credentials | undefined, token: string | null | undefined) {
    const current = this.hooks?.credentials();
    if (captured && (captured.state.revision !== current?.state.revision || token && token !== current?.token)) throw new ApiError('SESSION_CHANGED');
  }
  async call<T>(name: RpcName, params: Record<string, unknown> = {}, options: RpcOptions = {}): Promise<T> {
    const authenticated = options.authenticated ?? signedIn.has(name);
    const entering = this.hooks?.credentials();
    if (!options.skipReadiness && (authenticated || epochRequired.has(name))) await this.hooks?.ensureReady();
    if (!options.allowDetached) this.assertCurrent(entering, entering?.token);
    const captured = this.hooks?.credentials();
    const token = authenticated ? captured?.token : (typeof params.p_token === 'string' ? params.p_token : null);
    if (authenticated && (!token || !captured?.state.authenticated)) throw new ApiError('AUTH_REQUIRED');
    if (token && !options.allowDetached && token !== captured?.token) throw new ApiError('SESSION_CHANGED');
    const epoch = captured?.state.privacyEpoch;
    if (epochRequired.has(name) && !Number.isSafeInteger(epoch)) throw new ApiError('PRIVACY_EPOCH_NOT_READY');
    if (captured?.state.deletionPending && epochRequired.has(name)) throw new ApiError('ACCOUNT_DELETION_PENDING');
    const headers: Record<string, string> = epochRequired.has(name) ? { 'x-promotors-data-epoch': String(epoch) } : {};
    try {
      const data = await this.request(`/rest/v1/rpc/${name}`, authenticated ? { ...params, p_token: token } : params, headers);
      if (!options.allowDetached) this.assertCurrent(captured, token);
      return data as T;
    } catch (error) {
      const current = this.hooks?.credentials();
      if (error instanceof ApiError && token && token === current?.token && !options.allowDetached &&
        ['AUTH_REQUIRED', 'INVALID_SESSION', 'PRIVACY_EPOCH_CHANGED'].includes(error.code)) await this.hooks?.invalidate(error.code);
      throw error;
    }
  }
  async privateAssetUrl(key: string): Promise<string> {
    requireValue(typeof key === 'string' && /^[A-Za-z0-9_.-]{1,240}$/.test(key), 'INVALID_ARGUMENT');
    const entering = this.hooks?.credentials(); await this.hooks?.ensureReady(); this.assertCurrent(entering, entering?.token);
    const current = this.hooks?.credentials();
    requireValue(current?.token && current.state.authenticated, 'AUTH_REQUIRED');
    const value = await this.request(`/storage/v1/object/sign/promotors-private/${encodeURIComponent(key)}`,
      { expiresIn: 60 }, { 'x-promotors-token': current.token, 'Cache-Control': 'no-store' }) as { signedURL?: string };
    this.assertCurrent(current, current.token);
    const path = value?.signedURL;
    const url = typeof path === 'string' && path.startsWith('/object/sign/promotors-private/') ? `${PROMOTORS_SERVER}/storage/v1${path}` : path;
    requireValue(typeof url === 'string' && url.startsWith(`${PROMOTORS_SERVER}/storage/v1/object/sign/promotors-private/`), 'INVALID_RESPONSE');
    return url;
  }
  async uploadAsset(key: string, bytes: Uint8Array, contentType: string) {
    requireValue(/^(service|case|notice|branch|intro|event)-[A-Za-z0-9_.-]{1,220}$/.test(key) && bytes.length > 0 && bytes.length <= 6 * 1024 * 1024, 'INVALID_ARGUMENT');
    requireValue(['image/jpeg', 'image/png', 'image/webp'].includes(contentType), 'INVALID_ARGUMENT');
    const entering = this.hooks?.credentials();
    await this.hooks?.ensureReady(); this.assertCurrent(entering, entering?.token); const current = this.hooks?.credentials();
    requireValue(current?.token && current.state.authenticated && ['main', 'general', 'developer'].includes(current.state.role || ''), 'ADMIN_REQUIRED');
    requireValue(Number.isSafeInteger(current.state.privacyEpoch), 'PRIVACY_EPOCH_NOT_READY');
    const publicAsset = !key.startsWith('service-');
    if (publicAsset) requireValue(current.state.role === 'main', 'MAIN_ADMIN_REQUIRED');
    const bucket = publicAsset ? 'promotors-public' : 'promotors-private';
    const data = await this.request(`/storage/v1/object/${bucket}/${encodeURIComponent(key)}`, bytes,
      { 'x-promotors-token': current.token, 'x-promotors-data-epoch': String(current.state.privacyEpoch),
        'Content-Type': contentType, 'cache-control': publicAsset ? '31536000' : '0', 'x-upsert': 'false' });
    this.assertCurrent(current, current.token); return data;
  }
}
export function createRpcClient(options: ApiClientOptions) { return new NativeRpcClient(options); }
export type RpcClient = ReturnType<typeof createRpcClient>;
