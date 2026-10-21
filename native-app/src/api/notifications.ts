import type { RpcClient } from './client';
import { ApiError, requireValue } from './errors';
import type { SessionService } from '../auth/session';
import type { AdminBookingDetail, AdminBookingQueue, NativeBookingSnapshot, NativePushPlatform, NotificationOpenTarget,
  NotificationConnectionPreferences, NotificationPreferences, NotificationState, NotificationTarget, PushConnection } from '../domain/types';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const recordId = /^[A-Za-z0-9:_-]{1,128}$/;
interface PendingOpen { raw: NotificationOpenTarget; owner: string | null; revision: number; generation: number }
class NotificationsService {
  private binding: string | null = null;
  private owner: string | null = null;
  private revision = -1;
  private generation = 0;
  private busy = false;
  private restoration: Promise<void> | null = null;
  private restoreQueued = false;
  private opening = false;
  private restoredOwner = '';
  private platformQueue: Promise<void> = Promise.resolve();
  private pendingTarget: PendingOpen | null = null;
  private readonly actions = new Set<string>();
  private readonly listeners = new Set<(target: NotificationTarget) => void>();
  private readonly stopNative: () => void;
  private readonly stopSession: () => void;
  private readonly stopClear: () => void;
  constructor(private rpc: RpcClient, private session: SessionService, private push?: NativePushPlatform, private deviceId?: () => Promise<string>, private onChanged?: () => void, private connectionPreferences?: NotificationConnectionPreferences) {
    this.stopNative = push?.onOpen(target => { this.queueOpen(target); void this.flushOpen(); }) || (() => {});
    this.stopSession = session.subscribe(value => {
      const token = session.credentials().token, key = `${token || ''}:${value.revision}`;
      if (value.authenticated && key !== this.restoredOwner) {
        this.restoredOwner = key;
        this.restoreConnection().catch(() => {}).finally(() => { void this.flushOpen(); });
      }
    });
    this.stopClear = session.beforeClear(() => this.reset(false));
  }
  async state(): Promise<NotificationState> {
    const result = await this.rpc.call<NotificationState>('pm_notifications', { p_action: 'state', p_data: {} });
    requireValue(result && Array.isArray(result.items) && result.preferences, 'INVALID_RESPONSE'); return result;
  }
  async preferences(patch: Partial<NotificationPreferences>) {
    const allowed = ['enabled', 'booking', 'repair', 'reminders', 'marketing'];
    requireValue(Object.entries(patch).every(([key, value]) => allowed.includes(key) && typeof value === 'boolean'));
    if (patch.enabled === true) await this.enable();
    if (patch.enabled === false) await this.disable(true);
    const rest = { ...patch }; delete rest.enabled;
    if (Object.keys(rest).length) await this.rpc.call('pm_notifications', { p_action: 'preferences', p_data: rest });
    return this.state();
  }
  async connection(): Promise<PushConnection> {
    const value = await this.state(), current = this.session.credentials();
    const permission = this.push ? await this.push.permission() : 'default';
    const automatic = await this.connectionPreferences?.allowed(this.preferenceKey()) ?? true;
    this.assertSession(current.token, current.state.revision);
    return { automatic, supported: Boolean(this.push && this.deviceId), permission, enabled: value.preferences.enabled,
      connected: Boolean(value.preferences.enabled && permission === 'granted' && this.binding && this.owner === current.token && this.revision === current.state.revision) };
  }
  private preferenceKey() {
    const state = this.session.snapshot();
    return JSON.stringify([state.profile?.id || '', state.role, state.branches]);
  }
  private assertSession(owner: string | null, revision: number) {
    const current = this.session.credentials();
    if (!owner || owner !== current.token || revision !== current.state.revision || !current.state.authenticated) throw new ApiError('SESSION_CHANGED');
  }
  private guard(owner: string | null, revision: number, generation: number) {
    this.assertSession(owner, revision);
    if (generation !== this.generation) throw new ApiError('SESSION_CHANGED');
  }
  private platformChange(run: () => Promise<void>) {
    const next = this.platformQueue.catch(() => {}).then(run); this.platformQueue = next; return next;
  }
  private retryQueuedRestore() {
    if (!this.restoreQueued || this.busy || this.opening) return;
    this.restoreQueued = false;
    void this.restoreConnection().catch(() => {});
  }
  private async connect(permission: 'default' | 'granted' | 'denied', enable: boolean, expected: {owner: string | null; revision: number; generation: number}) {
    requireValue(this.push && this.deviceId, 'PUSH_NOT_CONFIGURED');
    if (permission !== 'granted') throw new ApiError('NOTIFICATION_PERMISSION_DENIED');
    const {owner, revision, generation} = expected;
    await this.session.ensureReady(); this.guard(owner, revision, generation);
    const preferenceKey = this.preferenceKey();
    const id = await this.deviceId(); this.guard(owner, revision, generation);
    requireValue(uuid.test(id), 'PUSH_NOT_CONFIGURED');
    const token = await this.push.getToken(); this.guard(owner, revision, generation);
    requireValue(typeof token === 'string' && token.length >= 20 && token.length <= 4096 && !/[\r\n]/.test(token), 'INVALID_RESPONSE');
    try {
      const result = await this.rpc.call<{ binding: string }>('pm_native_push_subscribe', { p_action: 'native_subscribe',
        p_data: { deviceId: id, token, transport: this.push.platform === 'ios' ? 'apns' : 'fcm' } });
      this.guard(owner, revision, generation);
      requireValue(typeof result.binding === 'string' && uuid.test(result.binding), 'INVALID_RESPONSE');
      await this.platformChange(async () => { this.guard(owner, revision, generation); await this.push!.bind(result.binding); });
      this.guard(owner, revision, generation);
      if (enable) {
        await this.rpc.call('pm_notifications', { p_action: 'preferences', p_data: { enabled: true } });
        this.guard(owner, revision, generation);
        await this.connectionPreferences?.save(preferenceKey, true);
      }
      this.guard(owner, revision, generation);
      this.binding = result.binding; this.owner = owner; this.revision = revision; void this.flushOpen();
    } catch (error) {
      if (generation === this.generation) {
        await this.platformChange(() => this.push!.clear()).catch(() => {}); this.binding = null; this.owner = null;
        if (owner === this.session.credentials().token) await this.rpc.call('pm_notifications', { p_action: 'unsubscribe', p_data: { deviceId: id } }).catch(() => {});
      }
      throw error;
    }
  }
  async enable() {
    const entering = this.session.credentials();
    while (this.restoration) {
      await this.restoration.catch(() => {});
      this.assertSession(entering.token, entering.state.revision);
    }
    this.assertSession(entering.token, entering.state.revision);
    if (this.busy || this.opening) throw new ApiError('REQUEST_IN_PROGRESS');
    requireValue(this.push && this.deviceId, 'PUSH_NOT_CONFIGURED'); this.busy = true;
    try {
      const generation = this.generation;
      await this.session.ensureReady(); this.guard(entering.token, entering.state.revision, generation);
      const { token, state } = this.session.credentials();
      requireValue(token, 'AUTH_REQUIRED');
      const permission = await this.push.requestPermission(); this.guard(token, state.revision, generation);
      await this.connect(permission, true, {owner: token, revision: state.revision, generation}); return this.connection();
    } finally { this.busy = false; this.retryQueuedRestore(); void this.flushOpen(); }
  }
  restoreConnection(): Promise<void> {
    if (this.restoration) {this.restoreQueued = true; return this.restoration;}
    const task = this.restore(); this.restoration = task;
    void task.finally(() => {
      if (this.restoration === task) {this.restoration = null; this.retryQueuedRestore();}
    }).catch(() => {});
    return task;
  }
  private async restore() {
    if (!this.push || !this.deviceId || !this.session.snapshot().authenticated) return;
    if (this.busy || this.opening) { this.restoreQueued = true; return; }
    this.busy = true;
    const { token, state } = this.session.credentials(), generation = this.generation;
    try {
      const value = await this.state(), permission = await this.push.permission();
      const automatic = await this.connectionPreferences?.allowed(this.preferenceKey()) ?? true;
      this.guard(token, state.revision, generation);
      if (automatic && value.preferences.enabled && permission === 'granted') await this.connect(permission, false, {owner: token, revision: state.revision, generation});
      else await this.reset(false);
    } finally { this.busy = false; void this.flushOpen(); }
  }
  async disable(allDevices = false) {
    const { token, state } = this.session.credentials(), id = await this.deviceId?.();
    this.assertSession(token, state.revision);
    await this.connectionPreferences?.save(this.preferenceKey(), false);
    this.assertSession(token, state.revision); await this.reset(); this.assertSession(token, state.revision);
    if (allDevices) await this.rpc.call('pm_notifications', { p_action: 'preferences', p_data: { enabled: false } });
    if (id) await this.rpc.call('pm_notifications', { p_action: 'unsubscribe', p_data: { deviceId: id } });
  }
  private async reset(clearPending = true) {
    this.generation++; this.binding = null; this.owner = null; this.revision = -1; this.restoredOwner = '';
    this.restoreQueued = false;
    if (clearPending) this.pendingTarget = null;
    else if (this.pendingTarget) this.pendingTarget = { ...this.pendingTarget, raw: { ...this.pendingTarget.raw, action: undefined, trustedAction: false } };
    await this.platformChange(() => this.push?.clear() || Promise.resolve());
  }
  private queueOpen(raw: NotificationOpenTarget) {
    const { token, state } = this.session.credentials();
    this.pendingTarget = { raw, owner: token, revision: state.revision, generation: this.generation };
  }
  private async verifyOpen(raw: NotificationOpenTarget): Promise<NotificationTarget> {
    const { token, state } = this.session.credentials(), generation = this.generation;
    this.assertSession(token, state.revision);
    requireValue(uuid.test(raw.binding), 'INVALID_ARGUMENT');
    requireValue((raw.notificationId === undefined || typeof raw.notificationId === 'string' && recordId.test(raw.notificationId)) &&
      (raw.bookingId === undefined || typeof raw.bookingId === 'string' && recordId.test(raw.bookingId)) &&
      (raw.runId === undefined || typeof raw.runId === 'string' && recordId.test(raw.runId)), 'INVALID_ARGUMENT');
    let target: NotificationTarget;
    if (raw.notificationId && recordId.test(raw.notificationId)) target = await this.resolve(raw.notificationId);
    else if (raw.runId && recordId.test(raw.runId)) {
      this.session.requireRole('customer'); await this.session.refresh();
      const rows = this.session.data()?.rows.find(row => row.data_key === 'pm-service-runs')?.payload;
      requireValue(Array.isArray(rows) && rows.some(row => row.id === raw.runId), 'FORBIDDEN');
      target = {kind: 'repair', id: raw.runId};
    } else if (raw.bookingId && recordId.test(raw.bookingId)) {
      if (state.role === 'customer') {
        await this.session.refresh();
        const rows = this.session.data()?.rows.find(row => row.data_key === 'pm-bookings')?.payload;
        requireValue(Array.isArray(rows) && rows.some(row => row.id === raw.bookingId), 'FORBIDDEN');
        target = { kind: 'booking', id: raw.bookingId };
      } else {
        this.session.requireRole('admin');
        const detail = await this.rpc.call<AdminBookingDetail>('pm_admin_booking_actions', { p_action: 'get', p_data: { id: raw.bookingId } });
        requireValue(detail?.booking?.id === raw.bookingId && (state.role !== 'general' || state.branches.includes(detail.booking.branch)), 'FORBIDDEN');
        target = { kind: 'booking', id: detail.booking.id, branch: detail.booking.branch };
      }
    } else {
      await this.session.refresh(); target = { kind: 'bookingSchedule' };
    }
    this.guard(token, state.revision, generation);
    return target;
  }
  private async performOpenAction(pending: PendingOpen, target: NotificationTarget) {
    const { raw, generation } = pending, current = this.session.credentials();
    const restored = pending.owner === null && generation === this.generation;
    const owner = restored ? current.token : pending.owner, revision = restored ? current.state.revision : pending.revision;
    if (this.session.snapshot().role === 'customer' || raw.trustedAction !== true || !this.push || !this.deviceId ||
      !this.binding || raw.binding !== this.binding || this.owner !== owner || target.kind !== 'booking' || !target.id ||
      !['accept', 'reject'].includes(raw.action || '')) return target;
    this.guard(owner, revision, generation);
    const key = `${raw.binding}:${target.id}:${raw.action}`;
    if (this.actions.has(key)) return target;
    await this.connect(await this.push.permission(), false, {owner, revision, generation}); this.guard(owner, revision, generation);
    if (raw.binding !== this.binding) return target;
    const id = await this.deviceId(); this.guard(owner, revision, generation);
    this.actions.add(key);
    if (this.actions.size > 200) this.actions.delete(this.actions.values().next().value!);
    try {
      const result = await this.rpc.call<AdminBookingDetail>('pm_admin_booking_actions', { p_action: raw.action,
        p_data: { id: target.id, nativeDeviceId: id, nativeBinding: raw.binding,
          ...(raw.action === 'reject' ? { reason: '관리자 알림에서 거절' } : {}) } });
      this.guard(owner, revision, generation);
      requireValue(result?.booking?.id === target.id && (this.session.snapshot().role !== 'general' || this.session.snapshot().branches.includes(result.booking.branch)), 'FORBIDDEN');
      this.onChanged?.();
      return { ...target, actionCompleted: true };
    } catch (error) {
      this.guard(owner, revision, generation);
      return { ...target, actionFailed: true, actionError: error instanceof ApiError ? error.code : 'REQUEST_FAILED' };
    }
  }
  private async flushOpen(): Promise<NotificationTarget | null> {
    if (this.opening || this.busy || !this.pendingTarget || !this.listeners.size || !this.session.snapshot().authenticated) return null;
    const pending = this.pendingTarget; this.pendingTarget = null; this.opening = true;
    const { token, state } = this.session.credentials(), generation = this.generation;
    let retryLater = false;
    try {
      const verified = await this.verifyOpen(pending.raw);
      let target = verified;
      try { target = await this.performOpenAction(pending, verified); } catch {
        this.guard(token, state.revision, generation);
      }
      this.guard(token, state.revision, generation);
      for (const listener of this.listeners) listener(target);
      return target;
    } catch (error) {
      const current = this.session.credentials();
      if (error instanceof ApiError && ['NETWORK_ERROR', 'TIMEOUT'].includes(error.code) && !this.pendingTarget &&
        token === current.token && state.revision === current.state.revision && generation === this.generation &&
        pending.generation === generation && (pending.owner === null || pending.owner === token)) {
        this.pendingTarget = pending; retryLater = true;
      }
      return null;
    } finally {
      this.opening = false; this.retryQueuedRestore();
      if (this.pendingTarget && !retryLater) void this.flushOpen();
    }
  }
  subscribeOpen(listener: (target: NotificationTarget) => void) {
    this.listeners.add(listener); void this.flushOpen(); return () => { this.listeners.delete(listener); };
  }
  async initialTarget() {
    if (!this.pendingTarget) { const raw = await this.push?.getInitialTarget(); if (raw) this.queueOpen(raw); }
    return this.flushOpen();
  }
  async registerActivityToken(event: { binding: string; kind: 'start' | 'update'; token: string }) {
    requireValue(this.session.snapshot().authenticated, 'AUTH_REQUIRED');
    requireValue(!this.session.snapshot().deletionPending, 'ACCOUNT_DELETION_PENDING');
    requireValue(this.push?.platform === 'ios' && this.deviceId && this.binding && event.binding === this.binding, 'DEVICE_BINDING_REQUIRED');
    requireValue(['start', 'update'].includes(event.kind) && /^[a-f0-9]{64,256}$/.test(event.token), 'INVALID_DEVICE');
    const { token, state } = this.session.credentials(), generation = this.generation;
    this.guard(token, state.revision, generation);
    const id = await this.deviceId(); this.guard(token, state.revision, generation);
    const result = await this.rpc.call('pm_native_push_subscribe', { p_action: 'native_activity', p_data: { deviceId: id, ...event } });
    this.guard(token, state.revision, generation); return result;
  }
  async bookingSnapshot(): Promise<NativeBookingSnapshot> {
    const empty: NativeBookingSnapshot = { active: false, binding: '', pendingCount: 0, upcomingCount: 0, branch: '', schedule: '',
      bookingId: '', startsAt: 0, customerName: '', vehicleName: '', vehiclePlate: '' };
    const { token, state } = this.session.credentials(), generation = this.generation;
    if (!state.authenticated || state.deletionPending || !this.binding || this.owner !== token || this.revision !== state.revision) return empty;
    if (state.role === 'customer') {
      const value = await this.rpc.call<NativeBookingSnapshot>('pm_customer_activity', {});
      this.guard(token, state.revision, generation);
      requireValue(value?.audience === 'customer' && typeof value.active === 'boolean', 'INVALID_RESPONSE');
      return {...value, binding: this.binding};
    }
    const value = await this.rpc.call<AdminBookingQueue>('pm_admin_booking_actions', { p_action: 'pending', p_data: {} });
    this.guard(token, state.revision, generation);
    const visible = (row: { branch: string }) => state.role !== 'general' || state.branches.includes(row.branch);
    const ordered = (rows: AdminBookingQueue['items']) => rows.filter(visible).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    const pending = ordered(value.items || []), upcoming = ordered(value.upcoming || []), first = pending[0] || upcoming[0];
    const startsAt = first ? Date.parse(`${first.date.replace(/\./g, '-')}T${first.time.slice(0, 5)}:00+09:00`) / 1000 : 0;
    return { ...empty, active: true, binding: this.binding || '', pendingCount: pending.length, upcomingCount: upcoming.length,
      branch: String(first?.branch || '프로모터스'), schedule: first ? `${first.date} · ${first.time}` : '', bookingId: String(first?.id || ''),
      startsAt: Number.isFinite(startsAt) ? startsAt : 0, customerName: String(first?.name || '').slice(0, 60),
      vehicleName: String(first?.model || '').slice(0, 80), vehiclePlate: String(first?.car || '').slice(0, 30) };
  }
  read(id?: string) { return this.rpc.call('pm_notifications', { p_action: 'read', p_data: id ? { id } : { all: true } }); }
  async resolve(id: string) {
    const target = await this.rpc.call<NotificationTarget>('pm_notifications', { p_action: 'resolve', p_data: { id } });
    requireValue(target && ['booking', 'repair', 'inquiry', 'events', 'inbox'].includes(target.kind), 'INVALID_RESPONSE'); return target;
  }
  async test(deviceId?: string) {
    const id = deviceId || await this.deviceId?.(); requireValue(id, 'PUSH_NOT_CONFIGURED');
    return this.rpc.call('pm_notifications', { p_action: 'test', p_data: { deviceId: id } });
  }
  maintenance(date: string | null) {
    requireValue(date === null || /^\d{4}-\d{2}-\d{2}$/.test(date));
    return this.rpc.call('pm_notifications', { p_action: 'maintenance', p_data: { date } });
  }
  deliveryLog() { return this.rpc.call<Record<string, unknown>[]>('pm_notifications', { p_action: 'delivery_log', p_data: {} }); }
  dispose() { this.stopNative(); this.stopSession(); this.stopClear(); this.listeners.clear(); return this.reset(); }
}
export function createNotificationsService(rpc: RpcClient, session: SessionService, push?: NativePushPlatform, deviceId?: () => Promise<string>, onChanged?: () => void, connectionPreferences?: NotificationConnectionPreferences) {
  return new NotificationsService(rpc, session, push, deviceId, onChanged, connectionPreferences);
}
