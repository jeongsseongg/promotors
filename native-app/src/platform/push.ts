import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import type {NativeBookingSnapshot, NativePushPlatform, NotificationOpenTarget, Permission} from '../domain/types';
import type {ActivityTokenEvent} from './activity-tokens';

interface NativeBridge {
  getPermissionStatus(): Promise<Permission>;
  requestPermission(): Promise<Permission>;
  getRegistrationToken(): Promise<string>;
  bindConnection(binding: string): Promise<void>;
  clearConnection(): Promise<void>;
  getDeviceId(): Promise<string>;
  getInitialTarget(): Promise<NotificationOpenTarget | null>;
  syncBookingSchedule(value: NativeBookingSnapshot): Promise<unknown>;
  clearBookingSchedule(): Promise<void>;
  getActivityTokenSnapshot?(): Promise<unknown>;
  consumeTrustedAction?(nonce: string): Promise<boolean>;
  addListener(name: string): void;
  removeListeners(count: number): void;
}
const bridge = NativeModules.PromotorsPush as NativeBridge | undefined;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const id = /^[A-Za-z0-9:_-]{1,128}$/;
let currentBinding: string | null = null;
let pendingBinding: string | null = null;
let generation = 0;
function native() {
  if (!bridge || !['ios', 'android'].includes(Platform.OS)) throw new Error('앱 알림을 준비하지 못했습니다. 앱을 다시 열어 주세요.');
  return bridge;
}
const events = bridge ? new NativeEventEmitter(bridge) : null;
function target(value: unknown): NotificationOpenTarget | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as NotificationOpenTarget;
  if (typeof raw.binding !== 'string' || !uuid.test(raw.binding) ||
    raw.notificationId !== undefined && (typeof raw.notificationId !== 'string' || !id.test(raw.notificationId)) ||
    raw.bookingId !== undefined && (typeof raw.bookingId !== 'string' || !id.test(raw.bookingId)) ||
    raw.runId !== undefined && (typeof raw.runId !== 'string' || !id.test(raw.runId))) return null;
  const action = raw.action === 'accept' || raw.action === 'reject' ? raw.action : undefined;
  return {binding: raw.binding, notificationId: raw.notificationId, bookingId: raw.bookingId,
    ...(raw.runId ? {runId: raw.runId} : {}), action, trustedAction: Boolean(action && raw.trustedAction === true)};
}
async function verifiedTarget(value: unknown) {
  const result = target(value);
  if (result?.trustedAction && Platform.OS === 'ios') {
    const nonce = (value as {actionNonce?: unknown}).actionNonce;
    result.trustedAction = typeof nonce === 'string' && uuid.test(nonce) &&
      await native().consumeTrustedAction?.(nonce).catch(() => false) === true;
  }
  return result;
}
export const nativePush: NativePushPlatform = {
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  permission: () => native().getPermissionStatus(),
  requestPermission: () => native().requestPermission(),
  getToken: () => native().getRegistrationToken(),
  async bind(binding) {
    if (!uuid.test(binding)) throw new Error('알림 연결 정보를 확인하지 못했습니다.');
    const captured = generation;
    pendingBinding = binding;
    try {
      await native().bindConnection(binding);
      if (captured === generation) currentBinding = binding;
      else throw new Error('알림 연결 계정이 변경되었습니다.');
    } finally {if (captured === generation && pendingBinding === binding) pendingBinding = null;}
  },
  async clear() {
    generation++; currentBinding = null; pendingBinding = null;
    await native().clearConnection();
  },
  onOpen(listener) {
    let active = true;
    const subscription = events?.addListener('pm-notification-open', value => {
      void verifiedTarget(value).then(verified => {if (active && verified) listener(verified);}).catch(() => {});
    });
    return () => {active = false; subscription?.remove();};
  },
  async getInitialTarget() {return verifiedTarget(await native().getInitialTarget());},
};
export async function deviceId() {
  const value = await native().getDeviceId();
  if (!uuid.test(value)) throw new Error('이 기기를 확인하지 못했습니다.');
  return value;
}
export function bindingSnapshot() {return {binding: currentBinding, generation};}
export interface ActivityTokenSnapshot {supported: boolean; enabled: boolean; binding: string | null; tokens: ActivityTokenEvent[]}
export async function activityTokenSnapshot(): Promise<ActivityTokenSnapshot> {
  const captured = bindingSnapshot();
  const empty = {supported: false, enabled: false, binding: null, tokens: []};
  if (Platform.OS !== 'ios' || !bridge?.getActivityTokenSnapshot) return empty;
  const raw = await bridge.getActivityTokenSnapshot() as Partial<ActivityTokenSnapshot> | null;
  if (captured.generation !== generation || captured.binding !== currentBinding) return empty;
  const supported = raw?.supported === true, enabled = supported && raw?.enabled === true;
  const binding = raw?.binding === currentBinding && currentBinding ? currentBinding : null;
  const tokens = enabled && binding && Array.isArray(raw?.tokens) ? raw.tokens.filter(event =>
    event && event.binding === binding && (event.kind === 'start' || event.kind === 'update') &&
    typeof event.token === 'string' && /^[a-f0-9]{64,256}$/.test(event.token)) : [];
  return {supported, enabled, binding, tokens};
}
export async function syncSchedule(value: NativeBookingSnapshot, captured: ReturnType<typeof bindingSnapshot>) {
  if (!captured.binding || captured.binding !== currentBinding || captured.generation !== generation) return;
  if (!value.active) {await native().clearBookingSchedule(); return;}
  if (value.binding !== captured.binding) return;
  await native().syncBookingSchedule(value);
}
export function onTokenRefresh(listener: () => void) {
  const sub = events?.addListener('pm-push-token-refreshed', listener);
  return () => sub?.remove();
}
export function onActivityToken(listener: (event: {binding: string; kind: 'start' | 'update'; token: string}) => void) {
  const sub = events?.addListener('pm-activity-token', raw => {
    const value = raw as {binding?: unknown; kind?: unknown; token?: unknown};
    if (value && typeof value.binding === 'string' && uuid.test(value.binding) &&
      value.binding === (pendingBinding || currentBinding) && (value.kind === 'start' || value.kind === 'update') &&
      typeof value.token === 'string' && /^[a-f0-9]{64,256}$/.test(value.token)) listener({
        binding: value.binding as string, kind: value.kind as 'start' | 'update', token: value.token});
  });
  return () => sub?.remove();
}
