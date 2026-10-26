import {createActivitySync} from '../activity-sync';
import type {ActivityTokenContext, ActivityTokenEvent} from '../activity-tokens';
const binding = '00000000-0000-4000-8000-000000000015';
const token: ActivityTokenEvent = {binding, kind: 'start', token: 'a'.repeat(64)};
function fixture() {
  let context: ActivityTokenContext = {owner: 'account-a', binding, generation: 1};
  const read = jest.fn(async () => ({supported: true, enabled: true, binding, tokens: [token]}));
  const register = jest.fn().mockResolvedValue(undefined);
  return {read, register, setContext(value: ActivityTokenContext) {context = value;},
    sync: createActivitySync({context: () => context, read, register})};
}
test('이벤트가 없어도 현재 토큰을 복구하고 서버 응답 뒤에만 상시 연결로 표시한다', async () => {
  const value = fixture(); let finish!: () => void;
  value.register.mockImplementationOnce(() => new Promise<void>(resolve => {finish = resolve;}));
  const refreshing = value.sync.refresh(); await Promise.resolve();
  expect(value.sync.status()?.connected).toBe(false);
  finish(); await refreshing;
  expect(value.sync.status()?.connected).toBe(true);
  await value.sync.refresh(); expect(value.register).toHaveBeenCalledTimes(1);
  value.sync.dispose();
});
test('휴대폰에서 상시 알림을 끄면 일반 토큰이 있어도 연결 완료로 표시하지 않는다', async () => {
  const value = fixture();
  value.read.mockResolvedValue({supported: true, enabled: false, binding, tokens: [token]});
  await value.sync.refresh();
  expect(value.sync.status()).toEqual({supported: true, enabled: false, connected: false});
  expect(value.register).not.toHaveBeenCalled(); value.sync.dispose();
});
test('계정 변경 도중 도착한 이전 토큰 조회 응답을 등록하지 않는다', async () => {
  const value = fixture(); let finish!: (snapshot: Awaited<ReturnType<typeof value.read>>) => void;
  value.read.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  const refreshing = value.sync.refresh();
  value.setContext({owner: 'account-b', binding, generation: 2});
  finish({supported: true, enabled: true, binding, tokens: [token]}); await refreshing;
  expect(value.register).not.toHaveBeenCalled(); expect(value.sync.status()).toBeUndefined(); value.sync.dispose();
});
test('네이티브 조회 오류는 미확인으로 남기며 다음 활성 조회에서 복구한다', async () => {
  const value = fixture(); value.read.mockRejectedValueOnce(new Error('native unavailable'));
  await value.sync.refresh(); expect(value.sync.status()).toBeUndefined();
  await value.sync.refresh(); expect(value.sync.status()?.connected).toBe(true); value.sync.dispose();
});
