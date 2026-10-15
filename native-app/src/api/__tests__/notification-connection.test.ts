import type {RpcClient} from '../client';
import {createNotificationsService} from '../notifications';
import {ApiError} from '../errors';
import type {SessionService} from '../../auth/session';
import type {NativePushPlatform, Permission, SessionSnapshot} from '../../domain/types';

const device = '00000000-0000-4000-8000-000000000016';
const binding = '00000000-0000-4000-8000-000000000015';
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function snapshot(id: string, revision: number): SessionSnapshot {
  return {status: 'signedIn', authenticated: true, role: 'customer', branches: [], profile: {id},
    expiresAt: null, privacyEpoch: 1, deletionPending: false, revision};
}
function fixture() {
  let state = snapshot('account-A', 1), token: string | null = 'synthetic-session-A';
  const subscribers = new Set<(value: SessionSnapshot) => void>();
  const clearHandlers = new Set<() => Promise<void> | void>();
  const session = {
    credentials: () => ({token, state: {...state}}), snapshot: () => ({...state}),
    ensureReady: jest.fn(async () => {}),
    subscribe: (listener: (value: SessionSnapshot) => void) => {subscribers.add(listener); return () => {subscribers.delete(listener);};},
    beforeClear: (listener: () => Promise<void> | void) => {clearHandlers.add(listener); return () => {clearHandlers.delete(listener);};},
  };
  const flags = new Map([['account-A', true], ['account-B', false]]);
  const intent = new Map<string, boolean>();
  const preferences = {
    allowed: jest.fn(async (key: string) => intent.get(key) !== false),
    save: jest.fn(async (key: string, allowed: boolean) => {intent.set(key, allowed);}),
  };
  const ownerKey = () => JSON.stringify([state.profile?.id || '', state.role, state.branches]);
  const rpc = {call: jest.fn(async (name: string, input: {p_action: string; p_data?: {enabled?: boolean}}) => {
    const id = state.profile?.id || '';
    if (name === 'pm_native_push_subscribe') return {binding};
    if (input.p_action === 'state') return {items: [], preferences: {enabled: flags.get(id), booking: true, repair: true, reminders: true, marketing: false}};
    if (input.p_action === 'preferences' && input.p_data?.enabled !== undefined) flags.set(id, input.p_data.enabled);
    return {};
  })};
  const push = {platform: 'ios' as const, permission: jest.fn(async (): Promise<Permission> => 'granted'),
    requestPermission: jest.fn(async (): Promise<Permission> => 'granted'),
    getToken: jest.fn(async () => 'synthetic-native-device-token-0000000000'), bind: jest.fn(async (_value: string) => {}),
    clear: jest.fn(async () => {}), onOpen: jest.fn(() => () => {}), getInitialTarget: jest.fn(async () => null)};
  const create = () => createNotificationsService(rpc as unknown as RpcClient, session as unknown as SessionService,
    push as NativePushPlatform, async () => device, undefined, preferences);
  async function switchAccount(id = 'account-B') {
    token = null; state = {...state, authenticated: false, status: 'signedOut', revision: state.revision + 1};
    subscribers.forEach(listener => listener({...state}));
    await Promise.all([...clearHandlers].map(listener => listener()));
    token = 'synthetic-session-' + id; state = snapshot(id, state.revision + 1);
    subscribers.forEach(listener => listener({...state}));
  }
  return {service: create(), create, rpc, push, session, preferences, flags, ownerKey, switchAccount};
}
function subscriptions(value: ReturnType<typeof fixture>) {
  return value.rpc.call.mock.calls.filter(([name]) => name === 'pm_native_push_subscribe');
}
async function settleUntil(predicate: () => boolean) {
  for (let turn = 0; turn < 40 && !predicate(); turn++) await Promise.resolve();
  expect(predicate()).toBe(true);
}

test('기기 알림을 직접 해제하면 복귀 복구가 재등록하지 않고 자동 연결을 끈다', async () => {
  const value = fixture(), key = value.ownerKey();
  await value.service.enable(); await value.service.disable(false);
  expect(value.preferences.save).toHaveBeenCalledWith(key, false);
  expect((await value.service.connection()).automatic).toBe(false);
  expect((await value.service.connection()).connected).toBe(false);
  value.rpc.call.mockClear(); value.push.bind.mockClear();
  await value.service.restoreConnection(); await value.service.restoreConnection();
  expect(subscriptions(value)).toHaveLength(0);
  expect(value.push.bind).not.toHaveBeenCalled();
  expect((await value.service.connection()).automatic).toBe(false);
});
test('명시적으로 다시 켜면 이 계정의 자동 연결 의도와 실제 기기 연결을 복구한다', async () => {
  const value = fixture(), key = value.ownerKey();
  await value.service.enable(); await value.service.disable(false); value.rpc.call.mockClear();
  await value.service.enable();
  expect(value.preferences.save).toHaveBeenLastCalledWith(key, true);
  expect(await value.service.connection()).toMatchObject({automatic: true, connected: true, permission: 'granted'});
  expect(subscriptions(value)).toHaveLength(1);
});
test('수동 해제 의도는 서비스가 다시 만들어져도 유지한다', async () => {
  const value = fixture();
  await value.service.enable(); await value.service.disable(false); await value.service.dispose();
  const reopened = value.create(); value.rpc.call.mockClear();
  await reopened.restoreConnection();
  expect(subscriptions(value)).toHaveLength(0);
  expect(await reopened.connection()).toMatchObject({automatic: false, connected: false});
});
test('다른 계정의 수동 해제 의도까지 함께 끄지 않는다', async () => {
  const value = fixture(), first = value.ownerKey();
  await value.service.enable(); await value.service.disable(false); await value.switchAccount();
  expect(value.ownerKey()).not.toBe(first);
  expect((await value.service.connection()).automatic).toBe(true);
  expect(value.preferences.save).not.toHaveBeenCalledWith(value.ownerKey(), false);
});
test('복구 요청 중 명시 연결은 충돌 오류 대신 순서대로 연결을 완료한다', async () => {
  const value = fixture(), gate = deferred<unknown>();
  value.flags.set('account-A', false);
  const implementation = value.rpc.call.getMockImplementation()!;
  value.rpc.call.mockImplementationOnce(() => gate.promise as ReturnType<typeof implementation>);
  const restoring = value.service.restoreConnection();
  await settleUntil(() => value.rpc.call.mock.calls.length > 0);
  const enabling = expect(value.service.enable()).resolves.toMatchObject({connected: true});
  gate.resolve({items: [], preferences: {enabled: false, booking: true, repair: true, reminders: true, marketing: false}});
  await restoring; await enabling;
  expect(subscriptions(value)).toHaveLength(1);
});
test('OS 권한 응답을 기다리는 동안 계정이 바뀌면 이전 연결을 폐기한다', async () => {
  const value = fixture(), permission = deferred<Permission>();
  value.push.requestPermission.mockImplementationOnce(() => permission.promise);
  const result = expect(value.service.enable()).rejects.toMatchObject({code: 'SESSION_CHANGED'});
  await settleUntil(() => value.push.requestPermission.mock.calls.length === 1);
  await value.switchAccount(); permission.resolve('granted'); await result;
  expect(subscriptions(value)).toHaveLength(0);
  expect(value.flags.get('account-B')).toBe(false);
});
test('connect의 준비 대기 뒤에는 새 계정을 이전 enable의 소유자로 채택하지 않는다', async () => {
  const value = fixture(), gate = deferred<void>();
  let calls = 0;
  value.session.ensureReady.mockImplementation(async () => {calls++; if (calls === 2) await gate.promise;});
  const result = expect(value.service.enable()).rejects.toMatchObject({code: 'SESSION_CHANGED'});
  await settleUntil(() => calls === 2);
  await value.switchAccount(); gate.resolve(); await result;
  expect(subscriptions(value)).toHaveLength(0);
  expect(value.flags.get('account-B')).toBe(false);
});
test('권한 거절은 서버 구독이나 마케팅 동의로 처리하지 않는다', async () => {
  const value = fixture(); value.push.requestPermission.mockResolvedValueOnce('denied');
  await expect(value.service.enable()).rejects.toBeInstanceOf(ApiError);
  expect(subscriptions(value)).toHaveLength(0);
  expect(value.rpc.call.mock.calls.some(([, input]) => input.p_action === 'preferences')).toBe(false);
});
test('서버 등록 실패는 기기 연결 성공이 아니며 기본 마케팅 선택을 변경하지 않는다', async () => {
  const value = fixture(), implementation = value.rpc.call.getMockImplementation()!;
  value.rpc.call.mockImplementation(async (name, input) => {
    if (name === 'pm_native_push_subscribe') throw new ApiError('NETWORK_ERROR');
    return implementation(name, input);
  });
  await expect(value.service.enable()).rejects.toMatchObject({code: 'NETWORK_ERROR'});
  expect((await value.service.connection()).connected).toBe(false);
  expect(value.push.bind).not.toHaveBeenCalled();
  expect(value.rpc.call.mock.calls.some(([, input]) => Object.hasOwn(input.p_data || {}, 'marketing'))).toBe(false);
});
test('enable의 첫 준비 대기 중에도 이전 계정이 새 계정 연결 권한을 승계하지 않는다', async () => {
  const value = fixture(), gate = deferred<void>();
  value.session.ensureReady.mockImplementationOnce(() => gate.promise);
  const result = expect(value.service.enable()).rejects.toMatchObject({code: 'SESSION_CHANGED'});
  await settleUntil(() => value.session.ensureReady.mock.calls.length === 1);
  await value.switchAccount(); gate.resolve(); await result;
  expect(subscriptions(value)).toHaveLength(0);
  expect(value.flags.get('account-B')).toBe(false);
});