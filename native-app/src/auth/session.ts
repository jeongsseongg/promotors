import { NATIVE_SYNC_RPC, type RpcClient } from '../api/client';
import { ApiError, requireValue } from '../api/errors';
import type { AuthContext, MemberProfile, Role, SessionSnapshot, SessionStorage, StoredSession, SyncRow, SyncSnapshot } from '../domain/types';

const publicKeys = new Set(['pm-branches', 'pm-notices', 'promotors-cases', 'pm-products', 'pm-blocked',
  'pm-blog-settings', 'pm-intro-slides', 'pm-home-view', 'pm-event-banners', 'pm-branch-hours']);
const roles = new Set<Role>(['customer', 'general', 'main', 'developer']);
const initial = (): SessionSnapshot => ({ status: 'signedOut', authenticated: false, role: null,
  branches: [], profile: null, expiresAt: null, privacyEpoch: null, deletionPending: false, revision: 0 });
interface LoginResult { token: string; expiresAt?: string }

function profileOnly(profile?: MemberProfile | null): MemberProfile | null {
  if (!profile) return null;
  const value = { ...profile };
  for (const key of ['password', 'password_hash', 'passwordHash', 'token', 'sessionToken']) delete value[key];
  return value;
}
function parseSync(value: unknown, floor: number): SyncSnapshot {
  requireValue(Array.isArray(value), 'INVALID_RESPONSE');
  const rows = value as SyncRow[];
  const epochs = rows.filter(row => row?.data_key === 'pm-privacy-epoch');
  const epoch = (epochs[0]?.payload as { epoch?: number })?.epoch;
  requireValue(epochs.length === 1 && Number.isSafeInteger(epoch) && Number(epoch) >= floor, 'PRIVACY_EPOCH_CHANGED');
  const contexts = rows.filter(row => row?.data_key === 'pm-auth-context');
  const context = contexts[0]?.payload as AuthContext | undefined;
  requireValue(contexts.length === 1 && context && typeof context.authenticated === 'boolean', 'INVALID_RESPONSE');
  if (context.authenticated) requireValue(context.role && roles.has(context.role), 'INVALID_RESPONSE');
  const branches = Array.isArray(context.branches) ? context.branches.filter(x => typeof x === 'string') : [];
  const ownerOf = (item: Record<string, unknown>) => {
    const direct = String(item.memberId || ''), embedded = String((item.customer as { id?: string } | undefined)?.id || '');
    return direct && embedded && direct !== embedded ? '' : direct || embedded;
  };
  const owners = new Set(rows.filter(row => ['pm-bookings', 'pm-service-runs'].includes(row.data_key)).flatMap(row => Array.isArray(row.payload) ? row.payload : [])
    .filter(item => branches.includes(item.branch)).map(ownerOf).filter(Boolean));
  const cleaned = rows.filter(row => {
    if (!row || typeof row.data_key !== 'string') return false;
    if (publicKeys.has(row.data_key)) return true;
    if (!context.authenticated) return false;
    if (context.role === 'general') return ['pm-bookings', 'pm-service-runs', 'pm-work-audit', 'pm-messages'].includes(row.data_key);
    return !['pm-auth-context', 'pm-privacy-epoch'].includes(row.data_key);
  }).map(row => {
    if (context.role !== 'general' || publicKeys.has(row.data_key)) return row;
    return { ...row, payload: Array.isArray(row.payload) ? row.payload.filter(item => {
      const record = item as Record<string, unknown>;
      if (row.data_key === 'pm-messages') return owners.has(ownerOf(record));
      return typeof record.branch === 'string' && branches.includes(record.branch);
    }) : [] };
  });
  return { rows: cleaned, context: { ...context, branches, profile: profileOnly(context.profile) }, epoch: Number(epoch) };
}

class SessionController {
  private state = initial();
  private token: string | null = null;
  private floor = 0;
  private persistent = false;
  private cache: SyncSnapshot | null = null;
  private refreshing: Promise<SyncSnapshot> | null = null;
  private restoring: Promise<SessionSnapshot> | null = null;
  private storageQueue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(value: SessionSnapshot) => void>();
  private readonly clearHandlers = new Set<() => Promise<void> | void>();
  constructor(private rpc: RpcClient, private storage: SessionStorage) {
    rpc.setSessionHooks({ credentials: () => this.credentials(), ensureReady: () => this.ensureReady(), invalidate: code => this.invalidate(code) });
  }
  snapshot(): SessionSnapshot { return { ...this.state, branches: [...this.state.branches], profile: profileOnly(this.state.profile) }; }
  credentials() { return { token: this.token, state: this.snapshot() }; }
  data() { return this.cache ? JSON.parse(JSON.stringify(this.cache)) as SyncSnapshot : null; }
  private publish() { for (const listener of this.listeners) listener(this.snapshot()); }
  private persist(value: StoredSession | null, revision = this.state.revision) {
    const next = this.storageQueue.catch(() => {}).then(async () => {
      if (revision === this.state.revision) await this.storage.writeSession(value);
    });
    this.storageQueue = next;
    return next;
  }
  private clearResources() { return Promise.all([...this.clearHandlers].map(handler => Promise.resolve().then(handler).catch(() => {}))); }
  async clear(removeStored = true) {
    this.token = null; this.cache = null; this.refreshing = null; this.persistent = false;
    const revision = this.state.revision + 1;
    this.state = { ...initial(), revision }; this.publish();
    await this.clearResources();
    if (removeStored) await this.persist(null, revision);
    return revision;
  }
  private async invalidate(code: string) {
    if (code !== 'PRIVACY_EPOCH_CHANGED') { await this.clear(); return; }
    this.cache = null; this.refreshing = null;
    this.state = { ...this.state, authenticated: false, status: 'restoring', role: null, branches: [], profile: null,
      privacyEpoch: null, revision: this.state.revision + 1 }; this.publish();
    await this.clearResources();
  }
  private async loadSnapshot(owner: string | null, revision: number): Promise<SyncSnapshot> {
    const rows = await this.rpc.call<unknown>(NATIVE_SYNC_RPC, { p_token: owner }, { skipReadiness: true });
    if (owner !== this.token || revision !== this.state.revision) throw new ApiError('SESSION_CHANGED');
    let next: SyncSnapshot;
    try { next = parseSync(rows, this.floor); }
    catch (error) { await this.invalidate('PRIVACY_EPOCH_CHANGED'); throw error; }
    requireValue(owner || !next.context.authenticated, 'INVALID_RESPONSE');
    if (owner && !next.context.authenticated) { await this.clear(); throw new ApiError('INVALID_SESSION'); }
    if (owner && next.context.role === 'main') {
      const developer = await this.rpc.call<unknown>('pm_is_developer', { p_token: owner }, { skipReadiness: true });
      if (owner !== this.token || revision !== this.state.revision) throw new ApiError('SESSION_CHANGED');
      requireValue(typeof developer === 'boolean', 'INVALID_RESPONSE');
      if (developer) next.context = { ...next.context, role: 'developer' };
    }
    const changed = this.state.privacyEpoch !== null && (next.epoch !== this.state.privacyEpoch ||
      this.state.role !== (next.context.role || null) || this.state.profile?.id !== next.context.profile?.id ||
      JSON.stringify(this.state.branches) !== JSON.stringify(next.context.branches || []));
    if (changed) {
      this.cache = null; await this.clearResources();
      if (owner !== this.token || revision !== this.state.revision) throw new ApiError('SESSION_CHANGED');
    }
    this.floor = next.epoch; this.cache = next;
    this.state = { ...this.state, status: owner ? 'signedIn' : 'signedOut', authenticated: next.context.authenticated,
      role: next.context.role || null, branches: next.context.branches || [], profile: next.context.profile || null,
      privacyEpoch: next.epoch, revision: this.state.revision + (changed ? 1 : 0) };
    this.publish();
    if (this.persistent && owner) await this.persist({ token: owner, expiresAt: this.state.expiresAt, privacyEpoch: this.floor });
    return next;
  }
  async refresh(): Promise<SyncSnapshot> {
    if (this.refreshing) return this.refreshing;
    const operation = this.loadSnapshot(this.token, this.state.revision);
    this.refreshing = operation;
    try { return await operation; } finally { if (this.refreshing === operation) this.refreshing = null; }
  }
  async ensureReady() {
    if (this.state.expiresAt && Date.parse(this.state.expiresAt) <= Date.now()) { await this.clear(); throw new ApiError('INVALID_SESSION'); }
    if (this.state.privacyEpoch === null || this.token && !this.state.authenticated) await this.refresh();
  }
  private async acceptLogin(result: LoginResult, revision: number, remember: boolean) {
    requireValue(result && typeof result.token === 'string' && result.token.length > 0, 'INVALID_RESPONSE');
    if (revision !== this.state.revision) {
      await this.rpc.call('pm_logout', { p_token: result.token }, { allowDetached: true }).catch(() => {});
      throw new ApiError('SESSION_CHANGED');
    }
    this.token = result.token; this.persistent = remember;
    this.state = { ...this.state, status: 'restoring', authenticated: false, expiresAt: result.expiresAt || null,
      privacyEpoch: null, revision: this.state.revision + 1 }; this.publish();
    try { await this.refresh(); return this.snapshot(); }
    catch (error) { if (this.token === result.token) await this.clear(); throw error; }
  }
  private async beginLogin() {
    const previous = this.token, revision = await this.clear();
    if (previous) await this.rpc.call('pm_logout', { p_token: previous }, { allowDetached: true }).catch(() => {});
    if (revision !== this.state.revision) throw new ApiError('SESSION_CHANGED');
    return revision;
  }
  async loginMember(id: string, password: string, remember = false) {
    const revision = await this.beginLogin();
    const result = await this.rpc.call<LoginResult>('pm_login', { p_login_id: id.trim(), p_password: password, p_remember: remember }, { allowDetached: true });
    return this.acceptLogin(result, revision, remember);
  }
  async loginAdmin(password: string, remember = false) {
    const revision = await this.beginLogin();
    const result = await this.rpc.call<LoginResult>('pm_admin_login', { p_password: password, p_remember: remember }, { allowDetached: true });
    return this.acceptLogin(result, revision, remember);
  }
  async loginBranchAdmin(id: string, password: string, remember = false) {
    const revision = await this.beginLogin();
    const result = await this.rpc.call<LoginResult>('pm_branch_admin_login', {p_login_id: id.trim(), p_password: password, p_remember: remember}, {allowDetached: true});
    return this.acceptLogin(result, revision, remember);
  }
  async register(profile: MemberProfile, password: string) {
    const revision = await this.beginLogin(); await this.ensureReady();
    const result = await this.rpc.call<LoginResult>('pm_register', { p_login_id: profile.id, p_password: password, p_profile: { ...profile, role: 'customer' } }, { allowDetached: true });
    return this.acceptLogin(result, revision, false);
  }
  private async restoreStored() {
    const revision = this.state.revision, saved = await this.storage.readSession();
    if (revision !== this.state.revision) throw new ApiError('SESSION_CHANGED');
    if (!saved?.token) { await this.clear(false); await this.refresh(); return this.snapshot(); }
    if (saved.expiresAt && Date.parse(saved.expiresAt) <= Date.now()) { await this.clear(); return this.snapshot(); }
    this.floor = Math.max(this.floor, Number.isSafeInteger(saved.privacyEpoch) ? Number(saved.privacyEpoch) : 0);
    this.token = saved.token; this.persistent = true;
    this.state = { ...this.state, expiresAt: saved.expiresAt || null, status: 'restoring', revision: this.state.revision + 1 }; this.publish();
    try { await this.refresh(); return this.snapshot(); }
    catch (error) {
      if (this.token === saved.token) await this.clear(error instanceof ApiError && ['AUTH_REQUIRED', 'INVALID_SESSION'].includes(error.code));
      throw error;
    }
  }
  async restore() {
    if (this.restoring) return this.restoring;
    if (this.state.authenticated) return this.snapshot();
    const operation = this.restoreStored(); this.restoring = operation;
    try { return await operation; } finally { if (this.restoring === operation) this.restoring = null; }
  }
  async logout() {
    const previous = this.token; await this.clear();
    if (previous) await this.rpc.call('pm_logout', { p_token: previous }, { allowDetached: true });
  }
  requireRole(role: 'customer' | 'admin', branch?: string) {
    if (!this.state.authenticated) throw new ApiError('AUTH_REQUIRED');
    const allowed = role === 'customer' ? this.state.role === 'customer' : ['general', 'main', 'developer'].includes(this.state.role || '');
    if (!allowed || branch && this.state.role === 'general' && !this.state.branches.includes(branch)) throw new ApiError('FORBIDDEN');
  }
  subscribe(listener: (value: SessionSnapshot) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  beforeClear(handler: () => Promise<void> | void) { this.clearHandlers.add(handler); return () => { this.clearHandlers.delete(handler); }; }
  markDeletionPending(pending: boolean) { this.state = { ...this.state, deletionPending: pending }; this.publish(); }
}
export function createSessionService(rpc: RpcClient, storage: SessionStorage) { return new SessionController(rpc, storage); }
export type SessionService = ReturnType<typeof createSessionService>;
