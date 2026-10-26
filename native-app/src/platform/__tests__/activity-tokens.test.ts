import {NativeModules} from 'react-native';
import {nativePush, onActivityToken} from '../push';
import type {ActivityTokenContext, ActivityTokenEvent} from '../activity-tokens';
function createActivityTokenQueue(options: Parameters<typeof import('../activity-tokens').createActivityTokenQueue>[0]) {return (require('../activity-tokens') as typeof import('../activity-tokens')).createActivityTokenQueue(options);}

const mockListeners = new Map<string, (value: unknown) => void>();
const binding = '00000000-0000-4000-8000-000000000015';
const secondBinding = '00000000-0000-4000-8000-000000000016';
const token = (kind: 'start' | 'update' = 'start', value = 'a', target = binding): ActivityTokenEvent => ({binding: target, kind, token: value.repeat(64)});

jest.mock('react-native', () => ({
  Platform: {OS: 'ios'},
  NativeModules: {PromotorsPush: {
    bindConnection: jest.fn(async (target: string) => {mockListeners.get('pm-activity-token')?.({binding: target, kind: 'start', token: 'a'.repeat(64)});}),
    clearConnection: jest.fn(async () => {}),
    addListener: jest.fn(), removeListeners: jest.fn(),
  }},
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: (name: string, listener: (value: unknown) => void) => {
      mockListeners.set(name, listener); return {remove: () => mockListeners.delete(name)};
    },
  })),
}));

beforeEach(() => {jest.useFakeTimers(); mockListeners.clear(); NativeModules.PromotorsPush.bindConnection.mockImplementation(async (target: string) => {mockListeners.get('pm-activity-token')?.(token('start', 'a', target));});});
afterEach(() => {jest.useRealTimers();});

test('연결 중에 받은 기존 시작 토큰을 binding promise 완료 전에 유실하지 않는다', async () => {
  const received = jest.fn(), stop = onActivityToken(received);
  await nativePush.clear();
  await nativePush.bind(binding);
  expect(received).toHaveBeenCalledWith(token());
  stop();
});

test('로그아웃 뒤에는 이전 binding의 네이티브 토큰을 전달하지 않는다', async () => {
  const received = jest.fn(), stop = onActivityToken(received);
  await nativePush.bind(binding); received.mockClear();
  await nativePush.clear();
  mockListeners.get('pm-activity-token')?.(token());
  expect(received).not.toHaveBeenCalled();
  stop();
});

test('재연결 중 이전 binding 이벤트가 새 대기 토큰을 덮지 않는다', async () => {
  const received = jest.fn(), stop = onActivityToken(received);
  await nativePush.bind(binding); received.mockClear();
  NativeModules.PromotorsPush.bindConnection.mockImplementationOnce(async () => {
    mockListeners.get('pm-activity-token')?.(token());
    mockListeners.get('pm-activity-token')?.(token('start', 'b', secondBinding));
  });
  await nativePush.bind(secondBinding);
  expect(received.mock.calls.map(call => call[0])).toEqual([token('start', 'b', secondBinding)]);
  stop();
});

test('로그아웃 전 bind의 늦은 완료가 같은 binding의 새 연결을 지우지 않는다', async () => {
  const received = jest.fn(), stop = onActivityToken(received);
  let finishOld!: () => void, finishNew!: () => void;
  NativeModules.PromotorsPush.bindConnection
    .mockImplementationOnce(() => new Promise<void>(resolve => {finishOld = resolve;}))
    .mockImplementationOnce(() => new Promise<void>(resolve => {finishNew = resolve;}));
  const old = nativePush.bind(binding).catch(() => {});
  await nativePush.clear();
  const next = nativePush.bind(binding);
  finishOld(); await old;
  mockListeners.get('pm-activity-token')?.(token());
  finishNew(); await next;
  expect(received).toHaveBeenCalledWith(token());
  stop();
});

test('플랫폼 binding과 서비스 binding 두 단계가 준비될 때까지 보관하고 재시도한다', async () => {
  let context: ActivityTokenContext = {owner: 'account-a:1', binding: null, generation: 1};
  const register = jest.fn().mockRejectedValueOnce(new Error('DEVICE_BINDING_REQUIRED')).mockResolvedValue(undefined);
  const queue = createActivityTokenQueue({context: () => context, register});
  queue.offer(token()); await queue.flush();
  expect(register).not.toHaveBeenCalled();
  context = {...context, binding};
  await queue.flush();
  expect(register).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(2000);
  expect(register).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(60000);
  expect(register).toHaveBeenCalledTimes(2);
  queue.dispose();
});

test('binding별 시작 및 갱신 토큰 두 개만 보관하고 같은 종류의 새 토큰으로 교체한다', async () => {
  let context: ActivityTokenContext = {owner: 'account-a:1', binding: null, generation: 1};
  const register = jest.fn().mockResolvedValue(undefined);
  const queue = createActivityTokenQueue({context: () => context, register});
  queue.offer(token('start', 'a')); queue.offer(token('update', 'b')); queue.offer(token('start', 'c'));
  context = {...context, binding}; await queue.flush();
  expect(register.mock.calls.map(call => call[0])).toEqual([token('start', 'c'), token('update', 'b')]);
  queue.dispose();
});

test('새 binding이 도착하면 이전 binding 토큰은 재등록하지 않는다', async () => {
  let context: ActivityTokenContext = {owner: 'account-a:1', binding: null, generation: 1};
  const register = jest.fn().mockResolvedValue(undefined);
  const queue = createActivityTokenQueue({context: () => context, register});
  queue.offer(token()); queue.offer(token('start', 'b', secondBinding));
  context = {...context, binding: secondBinding}; await queue.flush();
  expect(register).toHaveBeenCalledTimes(1);
  expect(register).toHaveBeenCalledWith(token('start', 'b', secondBinding));
  queue.dispose();
});

test('일시 실패 중 새 토큰이 오면 실패한 구 토큰 대신 최신 토큰을 재시도한다', async () => {
  const context: ActivityTokenContext = {owner: 'account-a:1', binding, generation: 1};
  let fail!: (error: Error) => void;
  const register = jest.fn().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {fail = reject;})).mockResolvedValue(undefined);
  const queue = createActivityTokenQueue({context: () => context, register});
  queue.offer(token('start', 'a'));
  await Promise.resolve();
  queue.offer(token('start', 'b')); fail(new Error('offline'));
  await queue.flush();
  await jest.advanceTimersByTimeAsync(2000);
  expect(register.mock.calls.map(call => call[0])).toEqual([token('start', 'a'), token('start', 'b')]);
  queue.dispose();
});

test('로그아웃과 다른 계정 로그인 때 보관 토큰을 폐기한다', async () => {
  let context: ActivityTokenContext = {owner: 'account-a:1', binding: null, generation: 1};
  const register = jest.fn().mockResolvedValue(undefined);
  const queue = createActivityTokenQueue({context: () => context, register});
  queue.offer(token());
  context = {owner: null, binding: null, generation: 2}; queue.reconcile();
  context = {owner: 'account-b:3', binding, generation: 2};
  await queue.flush(); await jest.advanceTimersByTimeAsync(60000);
  expect(register).not.toHaveBeenCalled();
  queue.dispose();
});

test('동일 계정이어도 native 연결 세대가 바뀌면 이전 토큰을 폐기한다', async () => {
  let context: ActivityTokenContext = {owner: 'account-a:1', binding: null, generation: 1};
  const register = jest.fn().mockResolvedValue(undefined);
  const queue = createActivityTokenQueue({context: () => context, register});
  queue.offer(token()); context = {...context, binding, generation: 2};
  await queue.flush();
  expect(register).not.toHaveBeenCalled();
  queue.dispose();
});

test('이미 등록한 토큰은 반복 조회해도 보내지 않고 연결 세대가 바뀌면 다시 검증한다', async () => {
  let context: ActivityTokenContext = {owner: 'account-a:1', binding, generation: 1};
  const register = jest.fn().mockResolvedValue(undefined);
  const queue = createActivityTokenQueue({context: () => context, register});
  queue.offer(token()); await queue.flush();
  queue.offer(token()); await queue.flush();
  expect(register).toHaveBeenCalledTimes(1);
  context = {...context, generation: 2}; queue.reconcile();
  queue.offer(token()); await queue.flush();
  expect(register).toHaveBeenCalledTimes(2);
  queue.dispose();
});

test('이전 계정 등록의 늦은 완료가 새 계정의 대기 토큰을 지우지 않는다', async () => {
  let context: ActivityTokenContext = {owner: 'account-a:1', binding, generation: 1};
  let finish!: () => void;
  const register = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => {finish = resolve;})).mockResolvedValue(undefined);
  const queue = createActivityTokenQueue({context: () => context, register});
  queue.offer(token()); await Promise.resolve();
  context = {owner: 'account-b:2', binding: secondBinding, generation: 2}; queue.reconcile();
  queue.offer(token('start', 'b', secondBinding)); finish();
  await queue.flush(); await jest.advanceTimersByTimeAsync(2000);
  expect(register.mock.calls.map(call => call[0])).toEqual([token(), token('start', 'b', secondBinding)]);
  queue.dispose();
});
