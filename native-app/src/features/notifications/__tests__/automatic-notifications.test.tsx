import React from 'react';
import {AppState, AppStateStatus, Modal, Text} from 'react-native';
import TestRenderer, {act, ReactTestRenderer} from 'react-test-renderer';
import App from '../../../App';
import {Button, Choice, Field, MenuRow} from '../../../components/Controls';
import {NativePush, NativeServices, PushStatus, Route} from '../../../components/AppContext';
import {Screen} from '../../../components/Screen';
import {createQaEnvironment} from '../../../qa/fixture-services';
import {createQaSession} from '../../../qa/fixture-session';
import type {StoreUpdates} from '../../../platform/app-updates';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
  SafeAreaView: require('react-native').View,
}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const trees: ReactTestRenderer[] = [];
const foregroundListeners = new Set<(state: AppStateStatus) => void>();
const originalState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function fixture(signedOut = false) {
  const environment = createQaEnvironment({screen: 'mypage'}, 'data:image/png;base64,qa');
  const auth = createQaSession(false, signedOut);
  let status: PushStatus = {permission: 'notDetermined', connected: false, automatic: true, deviceId: 'qa-device'};
  const push = {
    status: jest.fn(async () => ({...status})),
    connect: jest.fn(async () => {status = {...status, permission: 'granted', connected: true};}),
    disconnect: jest.fn(async () => {status = {...status, connected: false, automatic: false};}),
    openSettings: jest.fn(async () => {}),
  } satisfies NativePush;
  const services = {...environment.services, session: auth.session} as unknown as NativeServices;
  return {...environment, services, auth, push, setStatus: (patch: Partial<PushStatus>) => {status = {...status, ...patch};}};
}
async function settle() {
  await act(async () => {for (let turn = 0; turn < 12; turn++) await Promise.resolve();});
}
async function mount(value: ReturnType<typeof fixture>, route: Route = {name: 'my'}, updates?: StoreUpdates) {
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={value.services} push={value.push} initialRoute={route} updates={updates}/>);});
  trees.push(tree); await settle(); return tree;
}
function visibleModals(tree: ReactTestRenderer) {return tree.root.findAllByType(Modal).filter(node => node.props.visible === true);}
function text(node: ReactTestRenderer['root']) {
  return node.findAllByType(Text).flatMap(row => row.props.children).flat(Infinity).filter(item => typeof item === 'string').join('\n');
}
function modalText(tree: ReactTestRenderer) {return visibleModals(tree).map(text).join('\n');}
function findButton(tree: ReactTestRenderer, label: string) {
  const modals = visibleModals(tree);
  const nodes = modals.length ? modals.flatMap(node => node.findAllByType(Button)) : tree.root.findAllByType(Button);
  const found = nodes.find(node => node.props.label === label);
  if (!found || found.props.busy || found.props.disabled) throw new Error('누를 수 있는 버튼이 없습니다: ' + label);
  return found;
}
async function press(tree: ReactTestRenderer, label: string) {
  await act(async () => {await findButton(tree, label).props.onPress();}); await settle();
}
async function foreground(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', {value: state, writable: true, configurable: true});
  await act(async () => {foregroundListeners.forEach(listener => listener(state));}); await settle();
}
beforeEach(() => {
  Object.defineProperty(AppState, 'currentState', {value: 'active', writable: true, configurable: true});
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    foregroundListeners.add(callback);
    return {remove: () => {foregroundListeners.delete(callback);}};
  });
});
afterEach(async () => {
  await act(async () => trees.splice(0).forEach(tree => tree.unmount()));
  foregroundListeners.clear(); jest.restoreAllMocks();
  if (originalState) Object.defineProperty(AppState, 'currentState', originalState);
});

test('로그인 복원 직후 허용창과 연결을 자동 실행하고 서버 연결을 재확인한다', async () => {
  const value = fixture(), tree = await mount(value);
  expect(value.push.connect).toHaveBeenCalledTimes(1);
  expect(value.push.status.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(modalText(tree)).toContain('앱 알림이 연결됐어요');
  expect(visibleModals(tree)).toHaveLength(1);
  await press(tree, '알림 설정');
  expect(tree.root.findAllByType(Screen).some(node => node.props.title === '앱 알림 설정')).toBe(true);
  expect(visibleModals(tree)).toHaveLength(0);
  expect(value.calls).not.toContain('notification:test-fixture-only');
});
test('실제 로그인 화면의 로그인 완료 후 별도 연결 버튼 없이 알림을 연결한다', async () => {
  const value = fixture(true), tree = await mount(value, {name: 'login'});
  expect(value.push.connect).not.toHaveBeenCalled();
  await act(async () => {
    tree.root.findAllByType(Field).find(node => node.props.label === '아이디')!.props.onChangeText('qa-customer');
    tree.root.findAllByType(Field).find(node => node.props.label === '비밀번호')!.props.onChangeText('synthetic-password');
  });
  await press(tree, '로그인');
  expect(value.push.connect).toHaveBeenCalledTimes(1);
  expect(modalText(tree)).toContain('앱 알림이 연결됐어요');
});

test('관리자 로그인도 로그인 유지 후 연결 버튼 없이 앱 알림을 연결한다', async () => {
  const value = fixture(true), tree = await mount(value, {name: 'login'});
  await act(async () => {tree.root.findAllByType(Choice).find(node => node.props.label === '관리자 로그인')!.props.onPress();});
  await act(async () => {tree.root.findAllByType(Field).find(node => node.props.label === '관리자 비밀번호')!.props.onChangeText('synthetic-admin-password');});
  await press(tree, '로그인');
  expect(value.auth.session.snapshot().role).toBe('general');
  expect(value.push.connect).toHaveBeenCalledTimes(1);
  expect(modalText(tree)).toContain('앱 알림이 연결됐어요');
});

test('일반 알림만 연결됐으면 상시 알림은 별도 준비 상태로 표시한다', async () => {
  const value = fixture();
  value.setStatus({permission: 'granted', connected: true, ongoing: {supported: true, enabled: true, connected: false}});
  const tree = await mount(value, {name: 'notification-settings'});
  expect(text(tree.root)).toContain('상시 알림 연결 준비 중');
  expect(text(tree.root)).not.toContain('상시 알림 연결됨');
});
test('이미 연결된 기기나 사용자가 직접 끈 기기에는 자동 연결·안내를 반복하지 않는다', async () => {
  for (const patch of [{permission: 'granted' as const, connected: true}, {automatic: false}]) {
    const value = fixture(); value.setStatus(patch); const tree = await mount(value);
    expect(value.push.connect).not.toHaveBeenCalled();
    expect(visibleModals(tree)).toHaveLength(0);
  }
});
test.each(['reserve', 'profile', 'signup'] as const)('%s 입력 화면에서는 권한 요청을 보류한다', async name => {
  const value = fixture(), tree = await mount(value, {name});
  expect(value.push.connect).not.toHaveBeenCalled();
  expect(visibleModals(tree)).toHaveLength(0);
});
test('로그아웃 상태에서는 알림 권한이나 서버 기기 연결을 요청하지 않는다', async () => {
  const value = fixture(true), tree = await mount(value);
  expect(value.push.connect).not.toHaveBeenCalled();
  expect(value.push.status).not.toHaveBeenCalled();
  expect(visibleModals(tree)).toHaveLength(0);
});
test('OS에서 거절된 상태는 휴대폰 설정으로 직접 연결하고 허용 후 자동 연결한다', async () => {
  const value = fixture(); value.setStatus({permission: 'denied'});
  const tree = await mount(value);
  expect(modalText(tree)).toContain('앱 알림을 켜주세요');
  expect(value.push.connect).not.toHaveBeenCalled();
  await press(tree, '휴대폰 설정');
  expect(value.push.openSettings).toHaveBeenCalledTimes(1);
  await foreground('background');
  value.setStatus({permission: 'granted'});
  await foreground('active');
  expect(value.push.connect).toHaveBeenCalledTimes(1);
  expect(modalText(tree)).toContain('앱 알림이 연결됐어요');
});
test('거절 안내에서 나중에를 고르면 일반 복귀 때 권한 요청이나 안내를 반복하지 않는다', async () => {
  const value = fixture(); value.setStatus({permission: 'denied'});
  const tree = await mount(value);
  await press(tree, '나중에');
  await foreground('background'); await foreground('active');
  await foreground('background'); await foreground('active');
  expect(value.push.connect).not.toHaveBeenCalled();
  expect(visibleModals(tree)).toHaveLength(0);
});
test('첫 OS 허용창에서 거절해도 연결 성공으로 표시하거나 허용창을 반복하지 않는다', async () => {
  const value = fixture();
  value.push.connect.mockImplementationOnce(async () => {value.setStatus({permission: 'denied'}); throw new Error('권한 거절');});
  const tree = await mount(value);
  expect(value.push.connect).toHaveBeenCalledTimes(1);
  expect(modalText(tree)).toContain('앱 알림을 켜주세요');
  expect(modalText(tree)).not.toContain('앱 알림이 연결됐어요');
  await press(tree, '나중에'); await foreground('background'); await foreground('active');
  expect(value.push.connect).toHaveBeenCalledTimes(1);
});
test('권한 허용만 되고 서버 연결이 미완료이면 성공 안내를 표시하지 않는다', async () => {
  const value = fixture();
  value.push.connect.mockImplementationOnce(async () => {value.setStatus({permission: 'granted', connected: false});});
  const tree = await mount(value);
  expect(value.push.connect).toHaveBeenCalledTimes(1);
  expect(modalText(tree)).not.toContain('앱 알림이 연결됐어요');
  expect(modalText(tree)).toContain('알림 연결을 확인해 주세요');
});
test('서버 등록 실패는 오류로 남기고 사용자가 다시 누르면 연결을 재검증한다', async () => {
  const value = fixture(); value.push.connect.mockRejectedValueOnce(new Error('예시 서버 등록 실패'));
  const tree = await mount(value);
  expect(modalText(tree)).toContain('예시 서버 등록 실패');
  expect(modalText(tree)).not.toContain('앱 알림이 연결됐어요');
  await press(tree, '다시 시도');
  expect(value.push.connect).toHaveBeenCalledTimes(2);
  expect(modalText(tree)).toContain('앱 알림이 연결됐어요');
});

test('일시 등록 실패 후 앱에 다시 들어오면 버튼 없이 연결을 복구한다', async () => {
  const value = fixture(); value.push.connect.mockRejectedValueOnce(new Error('offline'));
  const tree = await mount(value);
  expect(value.push.connect).toHaveBeenCalledTimes(1);
  await foreground('background'); await foreground('active');
  expect(value.push.connect).toHaveBeenCalledTimes(2);
  expect(modalText(tree)).toContain('앱 알림이 연결됐어요');
});

test('일시 등록 실패는 활성 화면에서 자동 재시도하지만 나중에를 누르면 멈춘다', async () => {
  jest.useFakeTimers();
  try {
    const value = fixture(); value.push.connect.mockRejectedValue(new Error('offline'));
    const tree = await mount(value);
    await act(async () => {await jest.advanceTimersByTimeAsync(2000);}); await settle();
    expect(value.push.connect).toHaveBeenCalledTimes(2);
    await press(tree, '나중에');
    await act(async () => {await jest.advanceTimersByTimeAsync(120000);});
    await foreground('background'); await foreground('active');
    expect(value.push.connect).toHaveBeenCalledTimes(2);
    expect(visibleModals(tree)).toHaveLength(0);
  } finally {jest.useRealTimers();}
});
test('이전 계정의 연결 완료 응답은 새 계정의 성공 안내로 사용하지 않는다', async () => {
  const value = fixture(), connection = deferred<void>();
  value.push.connect.mockImplementationOnce(() => connection.promise);
  const tree = await mount(value);
  expect(value.push.connect).toHaveBeenCalledTimes(1);
  value.setStatus({permission: 'granted', connected: false, automatic: false});
  await act(async () => {value.auth.update({profile: {id: 'qa-other', name: '다른 예시 계정'}});});
  await act(async () => {connection.resolve();}); await settle();
  expect(visibleModals(tree)).toHaveLength(0);
  expect(modalText(tree)).not.toContain('앱 알림이 연결됐어요');
  expect(value.push.connect).toHaveBeenCalledTimes(1);
});
test('이전 계정의 늦은 상태 조회도 새 계정에 권한 요청을 시작하지 않는다', async () => {
  const value = fixture(), status = deferred<PushStatus>();
  value.push.status.mockImplementationOnce(() => status.promise);
  const tree = await mount(value);
  value.setStatus({automatic: false});
  await act(async () => {value.auth.update({profile: {id: 'qa-other', name: '다른 예시 계정'}});});
  await act(async () => {status.resolve({permission: 'notDetermined', connected: false, automatic: true});}); await settle();
  expect(value.push.connect).not.toHaveBeenCalled();
  expect(visibleModals(tree)).toHaveLength(0);
});
test('화면을 떠난 뒤 늦게 도착한 상태 조회는 입력 중 OS창을 띄우지 않는다', async () => {
  const value = fixture(), status = deferred<PushStatus>();
  value.push.status.mockImplementationOnce(() => status.promise);
  const tree = await mount(value);
  await act(async () => {tree.root.findAllByType(MenuRow).find(node => node.props.title === '내 차 관리')!.props.onPress();});
  await act(async () => {status.resolve({permission: 'notDetermined', connected: false, automatic: true});}); await settle();
  expect(value.push.connect).not.toHaveBeenCalled();
  expect(visibleModals(tree)).toHaveLength(0);
});
test('앱이 백그라운드이면 권한 요청을 미루고 활성 화면 복귀 때 연결한다', async () => {
  Object.defineProperty(AppState, 'currentState', {value: 'background', writable: true, configurable: true});
  const value = fixture(), tree = await mount(value);
  expect(value.push.connect).not.toHaveBeenCalled();
  await foreground('active');
  expect(value.push.connect).toHaveBeenCalledTimes(1);
  expect(modalText(tree)).toContain('앱 알림이 연결됐어요');
});
test('새 버전과 알림 연결 안내는 동시에 두 Modal을 표시하지 않는다', async () => {
  const value = fixture(), connection = deferred<void>();
  value.push.connect.mockImplementationOnce(() => connection.promise);
  const updates = {check: jest.fn(async () => ({key: 'synthetic-new-release', version: '2.0.0'})), openStore: jest.fn(async () => {})};
  const tree = await mount(value, {name: 'my'}, updates);
  expect(visibleModals(tree).length).toBeLessThanOrEqual(1);
  value.setStatus({permission: 'granted', connected: true});
  await act(async () => {connection.resolve();}); await settle();
  expect(visibleModals(tree)).toHaveLength(1);
  expect(modalText(tree)).not.toMatch(/새 버전이 나왔어요[\s\S]*앱 알림이 연결됐어요|앱 알림이 연결됐어요[\s\S]*새 버전이 나왔어요/);
  await act(async () => {visibleModals(tree)[0].props.onRequestClose();}); await settle();
  expect(visibleModals(tree).length).toBeLessThanOrEqual(1);
});
test('업데이트 안내에서도 알림 설정 화면을 바로 열 수 있다', async () => {
  const value = fixture(); value.setStatus({permission: 'granted', connected: true});
  const updates = {check: async () => ({key: 'synthetic-new-release', version: '2.0.0'}), openStore: jest.fn(async () => {})};
  const tree = await mount(value, {name: 'my'}, updates);
  expect(modalText(tree)).toContain('새 버전이 나왔어요');
  await press(tree, '알림 설정');
  expect(tree.root.findAllByType(Screen).some(node => node.props.title === '앱 알림 설정')).toBe(true);
  expect(visibleModals(tree)).toHaveLength(0);
});
test('업데이트 안내의 설정 화면에서 휴대폰 설정을 열어도 복귀 시 자동 연결한다', async () => {
  const value = fixture(); value.setStatus({permission: 'denied'});
  const updates = {check: async () => ({key: 'synthetic-settings-release', version: '2.0.0'}), openStore: jest.fn(async () => {})};
  const tree = await mount(value, {name: 'my'}, updates);
  expect(modalText(tree)).toContain('앱 알림을 켜주세요');
  await press(tree, '나중에');
  expect(modalText(tree)).toContain('새 버전이 나왔어요');
  await press(tree, '알림 설정');
  expect(tree.root.findAllByType(Screen).some(node => node.props.title === '앱 알림 설정')).toBe(true);
  expect(value.push.connect).not.toHaveBeenCalled();
  await press(tree, '휴대폰 설정');
  expect(value.push.openSettings).toHaveBeenCalledTimes(1);
  await foreground('background');
  value.setStatus({permission: 'granted', connected: false});
  await foreground('active');
  expect(value.push.connect).toHaveBeenCalledTimes(1);
  expect(modalText(tree)).toContain('앱 알림이 연결됐어요');
  await press(tree, '확인');
  expect(visibleModals(tree)).toHaveLength(0);
  expect(tree.root.findAllByType(Button).some(node => node.props.label === '테스트 알림 보내기')).toBe(true);
  expect(value.calls).not.toContain('notification:test-fixture-only');
});
