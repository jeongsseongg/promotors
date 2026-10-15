import React from 'react';
import {AppState, Modal, Text} from 'react-native';
import TestRenderer, {act, ReactTestRenderer} from 'react-test-renderer';
import {UpdateNotice} from '../UpdateNotice';
import {Button} from '../../../components/Controls';
import {createStoreUpdates, readAppleRelease, StoreUpdates} from '../../../platform/app-updates';
import App from '../../../App';
import {NativeServices, Route} from '../../../components/AppContext';
import {createQaEnvironment} from '../../../qa/fixture-services';
import {createQaSession} from '../../../qa/fixture-session';

jest.mock('react-native-safe-area-context', () => ({SafeAreaView: require('react-native').View, SafeAreaProvider: ({children}: {children: React.ReactNode}) => children}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const trees: ReactTestRenderer[] = [];
let foreground: ((state: string) => void) | undefined;
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    foreground = callback as (state: string) => void;
    return {remove: jest.fn()};
  });
});
afterEach(async () => {await act(async () => trees.splice(0).forEach(tree => tree.unmount())); jest.restoreAllMocks(); jest.useRealTimers();});
const release = {key: '2.0.0', version: '2.0.0'};
function client(check = jest.fn(async () => release)) {return {check, openStore: jest.fn(async () => {})};}
async function mount(updater: StoreUpdates, eligible = true) {
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<UpdateNotice updates={updater} eligible={eligible}/>);});
  trees.push(tree); return tree;
}
function button(tree: ReactTestRenderer, label: string) {return tree.root.findAllByType(Button).find(node => node.props.label === label)!;}
function visible(tree: ReactTestRenderer) {return tree.root.findAllByType(Modal).some(node => node.props.visible);}

test('새 버전 안내의 업데이트 버튼은 스토어를 열고 안내를 닫는다', async () => {
  const updater = client(), tree = await mount(updater);
  expect(visible(tree)).toBe(true);
  expect(tree.root.findAllByType(Text).some(node => node.props.children === '새 버전이 나왔어요')).toBe(true);
  await act(async () => {await button(tree, '업데이트').props.onPress();});
  expect(updater.openStore).toHaveBeenCalledTimes(1);
  expect(visible(tree)).toBe(false);
});
test('예약 입력 중에는 안내를 미루고 안전한 화면으로 돌아오면 표시한다', async () => {
  const updater = client(), tree = await mount(updater, false);
  expect(visible(tree)).toBe(false);
  await act(async () => {tree.update(<UpdateNotice updates={updater} eligible/>);});
  expect(visible(tree)).toBe(true);
});
test('나중에 선택한 버전은 복귀할 때 다시 강제로 띄우지 않는다', async () => {
  jest.useFakeTimers();
  const updater = client(), tree = await mount(updater);
  await act(async () => {button(tree, '나중에').props.onPress();});
  await act(async () => {jest.advanceTimersByTime(6 * 60 * 1000); foreground?.('active');});
  expect(updater.check).toHaveBeenCalledTimes(2);
  expect(visible(tree)).toBe(false);
});
test('최신 버전·조회 실패일 때 예약 화면을 가리는 안내를 만들지 않는다', async () => {
  for (const check of [async () => null, async () => {throw new Error('offline');}]) {
    const tree = await mount({check, openStore: jest.fn()});
    expect(visible(tree)).toBe(false);
  }
});
test('스토어 열기에 실패하면 재시도할 수 있고 완료로 숨기지 않는다', async () => {
  const updater = client(); updater.openStore.mockRejectedValueOnce(new Error('unavailable'));
  const tree = await mount(updater);
  await act(async () => {await button(tree, '업데이트').props.onPress();});
  expect(visible(tree)).toBe(true);
  expect(tree.root.findAllByType(Text).some(node => String(node.props.children).includes('스토어를 열지 못했어요'))).toBe(true);
  await act(async () => {await button(tree, '업데이트').props.onPress();});
  expect(visible(tree)).toBe(false);
});
const apple = (version: string, minimumOsVersion = '15.1') => ({results: [{trackId: 6810716100, bundleId: 'kr.promotors.app', version, minimumOsVersion}]});
test('아이폰 버전은 숫자로 비교하고 같은 버전·낮은 버전·지원되지 않는 OS는 제외한다', () => {
  expect(readAppleRelease(apple('1.10.0'), '1.9.0', '18.0')?.version).toBe('1.10.0');
  expect(readAppleRelease(apple('1.1.0'), '1.1', '18.0')).toBeNull();
  expect(readAppleRelease(apple('1.0.1'), '1.1.0', '18.0')).toBeNull();
  expect(readAppleRelease(apple('2.0.0', '19.0'), '1.1.0', '18.0')).toBeNull();
});
test('다른 앱·잘못된 버전·불완전한 스토어 응답으로 업데이트를 권하지 않는다', () => {
  for (const data of [{results: []}, {results: [{...apple('2.0.0').results[0], trackId: 1}]}, {results: [{...apple('2.0.0').results[0], bundleId: 'other.app'}]}, apple('2.0-beta'), apple('2.0.0', 'unknown')]) {
    expect(readAppleRelease(data, '1.1.0', '18.0')).toBeNull();
  }
});
test('갤럭시는 실제 Play의 설치 버전보다 높은 공개 버전만 안내한다', async () => {
  const check = jest.fn(async () => ({available: true, availableCode: 20, currentCode: 8}));
  const updater = createStoreUpdates({platform: 'android', androidCheck: check});
  expect(await updater.check()).toEqual({key: '20'});
  check.mockResolvedValueOnce({available: false, availableCode: 20, currentCode: 8});
  expect(await updater.check()).toBeNull();
  check.mockResolvedValueOnce({available: true, availableCode: 8, currentCode: 8});
  expect(await updater.check()).toBeNull();
});
test('스토어 앱을 열 수 없으면 고정된 공식 스토어 주소로 연결한다', async () => {
  const open = jest.fn(async (_url: string) => {}).mockRejectedValueOnce(new Error('no store handler'));
  await createStoreUpdates({platform: 'android', open}).openStore();
  expect(open.mock.calls.map(call => call[0])).toEqual(['market://details?id=kr.promotors.app', 'https://play.google.com/store/apps/details?id=kr.promotors.app']);
  open.mockClear();
  await createStoreUpdates({platform: 'ios', open}).openStore();
  expect(open).toHaveBeenCalledWith('https://apps.apple.com/kr/app/id6810716100');
});
test('조회가 지연되면 제한 시간 뒤 끝내고 다음 확인을 막지 않는다', async () => {
  jest.useFakeTimers();
  const updater = createStoreUpdates({platform: 'android', androidCheck: () => new Promise(() => {})});
  const result = expect(updater.check()).rejects.toThrow();
  await jest.advanceTimersByTimeAsync(11000);
  await result;
});
test.each(['admin', 'notifications', 'notification-settings', 'signed-out-admin'])('%s 입력 화면에서는 실제 앱의 자동 안내를 보류한다', async name => {
  const environment = createQaEnvironment({screen: 'admin'}, 'data:image/png;base64,qa');
  const auth = createQaSession(true, name === 'signed-out-admin');
  const services = {...environment.services, session: auth.session} as unknown as NativeServices;
  const route: Route = {name: name === 'signed-out-admin' ? 'admin' : name as 'admin' | 'notifications' | 'notification-settings'};
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={services} push={environment.push} initialRoute={route} updates={client()}/>);});
  trees.push(tree);
  expect(visible(tree)).toBe(false);
});
