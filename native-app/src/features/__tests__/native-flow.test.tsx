import React from 'react';
import {Alert, Text} from 'react-native';
import TestRenderer, {act, ReactTestRenderer} from 'react-test-renderer';
import App from '../../App';
import {Button, Choice, MenuRow} from '../../components/Controls';
import {createQaEnvironment} from '../../qa/fixture-services';
import {Calendar} from '../booking/Calendar';
import {BookingCard} from '../admin/BookingCard';
import {HomeScreen} from '../home/HomeScreen';
import {NotificationTarget} from '../../domain/types';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
  SafeAreaView: require('react-native').View,
}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const trees: ReactTestRenderer[] = [];
async function mount(screen: 'booking' | 'mypage' | 'admin' | 'notifications') {
  const environment = createQaEnvironment({screen}, 'data:image/png;base64,qa');
  const tree = await render(environment);
  return {environment, tree};
}
async function render(environment: ReturnType<typeof createQaEnvironment>) {
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={environment.services} push={environment.push} initialRoute={environment.initialRoute}/>);});
  trees.push(tree); return tree;
}
async function press(tree: ReactTestRenderer, label: string) {
  const node = tree.root.findAllByType(Button).find(row => row.props.label === label);
  if (!node || node.props.disabled || node.props.busy) throw new Error('누를 수 있는 버튼이 없습니다: ' + label);
  await act(async () => {await node.props.onPress();});
}
async function choose(tree: ReactTestRenderer, label: string) {
  const node = tree.root.findAllByType(Choice).find(row => row.props.label === label);
  if (!node || node.props.disabled) throw new Error('선택할 수 없습니다: ' + label);
  await act(async () => {node.props.onPress();});
}
function texts(tree: ReactTestRenderer) {return tree.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).filter(value => typeof value === 'string').join('\n');}
beforeEach(() => {jest.useFakeTimers();});
afterEach(async () => {await act(async () => {trees.splice(0).forEach(tree => tree.unmount());}); jest.useRealTimers(); jest.restoreAllMocks();});

it('09시는 영업시간 외로 막고 서버 접수 실패를 완료로 표시하지 않는다', async () => {
  const {environment, tree} = await mount('booking');
  await choose(tree, '프로모터스 안산점');
  const future = new Date(); future.setDate(future.getDate() + 3);
  while (future.getDay() === 0) future.setDate(future.getDate() + 1);
  const date = [future.getFullYear(), String(future.getMonth() + 1).padStart(2, '0'), String(future.getDate()).padStart(2, '0')].join('.');
  const calendar = tree.root.findByType(Calendar);
  expect(calendar.props.disabledDate(date)).toBe(false);
  await act(async () => {calendar.props.onSelect(date);});
  const nine = tree.root.findAllByType(Choice).find(row => row.props.label.startsWith('09:00'));
  expect(nine?.props.disabled).toBe(true);
  expect(nine?.props.label).toContain('영업시간 외');
  await choose(tree, '10:00');
  await press(tree, '다음');
  await choose(tree, '엔진오일 교환');
  const create = jest.spyOn(environment.services.bookings, 'create').mockRejectedValueOnce(new Error('예약 접수 실패 (검증용)'));
  await press(tree, '예약 신청');
  expect(create).toHaveBeenCalledTimes(1);
  expect(texts(tree)).toContain('예약 접수 실패 (검증용)');
  expect(texts(tree)).not.toContain('예약 신청이\n접수되었어요.');
  create.mockResolvedValueOnce({id: 'qa-created', branch: '프로모터스 안산점', date, time: '10:00', status: '신규'});
  await press(tree, '예약 신청');
  expect(texts(tree)).toContain('접수되었어요.');
});

it('관리자에게 지정 지점만 보여주고 상세 승인 후 최신 상태로 바꾼다', async () => {
  const {environment, tree} = await mount('admin');
  expect(texts(tree)).not.toContain('프로모터스 새솔점');
  expect(texts(tree)).toContain('예시 고객');
  const card = tree.root.findAllByType(BookingCard).find(row => row.props.booking.id === 'qa-pending');
  await act(async () => {card!.props.onOpen();});
  expect(texts(tree)).toContain('예약 전체 정보');
  expect(texts(tree)).toContain('기존 고객 기록');
  expect(texts(tree)).toContain('고객 처리 로그');
  await press(tree, '예약 승인');
  expect(environment.data.bookings.find(row => row.id === 'qa-pending')?.status).toBe('예약');
  expect(tree.root.findAllByType(Button).filter(row => row.props.label === '예약 승인')).toHaveLength(0);
});

it('알림 연결 상태를 재확인하고 테스트 버튼을 누른 경우에만 발송을 요청한다', async () => {
  const {environment, tree} = await mount('notifications');
  expect(environment.calls).not.toContain('notification:test-fixture-only');
  await press(tree, '앱 알림 연결');
  expect(texts(tree)).toContain('연결됨 · 프로모터스 앱으로 알려드려요.');
  expect(environment.calls).not.toContain('notification:test-fixture-only');
  await press(tree, '테스트 알림 보내기');
  expect(environment.calls.filter(value => value === 'notification:test-fixture-only')).toHaveLength(1);
  expect(texts(tree)).toContain('휴대폰 알림창에서 실제 도착을 확인해 주세요.');
});

it('권한만 허용되고 서버 기기 연결이 안 된 경우 성공으로 표시하지 않는다', async () => {
  const environment = createQaEnvironment({screen: 'notifications'}, 'data:image/png;base64,qa');
  environment.push.connect = async () => {};
  environment.push.status = async () => ({permission: 'granted', connected: false, deviceId: 'qa-device'});
  const tree = await render(environment);
  await press(tree, '앱 알림 연결');
  expect(texts(tree)).toContain('알림 연결이 완료되지 않았습니다.');
  expect(texts(tree)).not.toContain('이 기기의 앱 알림을 연결했습니다.');
  expect(environment.calls).not.toContain('notification:test-fixture-only');
});

it('같은 예약 상세에서 네이티브 알림을 다시 열면 처리된 최신 예약을 조회한다', async () => {
  const environment = createQaEnvironment({screen: 'admin'}, 'data:image/png;base64,qa');
  let listener: ((target: NotificationTarget) => void) | undefined;
  environment.services.notifications.subscribeOpen = callback => {listener = callback; return () => {listener = undefined;};};
  const get = jest.spyOn(environment.services.adminBookings, 'get');
  const tree = await render(environment);
  await act(async () => {listener!({kind: 'booking', id: 'qa-pending'});});
  expect(get).toHaveBeenCalledTimes(1);
  environment.data.bookings.find(row => row.id === 'qa-pending')!.status = '예약';
  await act(async () => {listener!({kind: 'booking', id: 'qa-pending'});});
  expect(get).toHaveBeenCalledTimes(2);
  expect(tree.root.findAllByType(Button).filter(row => row.props.label === '예약 승인')).toHaveLength(0);
});

it('로그아웃하면 이전 고객의 차량과 정비 정보를 화면에서 제거한다', async () => {
  const {tree} = await mount('mypage');
  expect(texts(tree)).toContain('예시 고객');
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {buttons?.find(button => button.text === '로그아웃')?.onPress?.();});
  const logout = tree.root.findAllByType(MenuRow).find(row => row.props.title === '로그아웃');
  await act(async () => {await logout!.props.onPress();});
  expect(texts(tree)).not.toContain('예시 고객');
  expect(texts(tree)).not.toContain('BMW 520d');
  expect(tree.root.findAllByType(HomeScreen)).toHaveLength(1);
});

it('실제 세션처럼 지점 배열의 객체가 바뀌어도 관리자 조회를 반복하지 않는다', async () => {
  const environment = createQaEnvironment({screen: 'admin'}, 'data:image/png;base64,qa');
  const snapshot = environment.services.session.snapshot.bind(environment.services.session);
  jest.spyOn(environment.services.session, 'snapshot').mockImplementation(() => {const current = snapshot(); return {...current, branches: [...current.branches]};});
  const list = jest.spyOn(environment.services.adminBookings, 'list');
  const tree = await render(environment);
  expect(list).toHaveBeenCalledTimes(1);
  await choose(tree, '전체 일정');
  expect(list).toHaveBeenCalledTimes(1);
  expect(texts(tree)).toContain('매장 예약 일정');
});

it('OS 알림의 예약 처리 실패를 상세에 알리고 임의로 성공 처리하지 않는다', async () => {
  const environment = createQaEnvironment({screen: 'admin'}, 'data:image/png;base64,qa');
  let listener: ((target: NotificationTarget) => void) | undefined;
  environment.services.notifications.subscribeOpen = callback => {listener = callback; return () => {};};
  const tree = await render(environment);
  await act(async () => {listener!({kind: 'booking', id: 'qa-pending', actionFailed: true});});
  expect(texts(tree)).toContain('알림에서 예약 처리를 완료하지 못했습니다.');
  expect(environment.data.bookings.find(row => row.id === 'qa-pending')?.status).toBe('신규');
  expect(tree.root.findAllByType(Button).some(row => row.props.label === '예약 승인')).toBe(true);
});

it('로그인 복구 네트워크 장애를 잡고 재시도할 수 있는 오류 화면을 표시한다', async () => {
  const environment = createQaEnvironment({screen: 'mypage'}, 'data:image/png;base64,qa');
  const restore = jest.spyOn(environment.services.session, 'restore').mockRejectedValueOnce(new Error('연결 확인 실패 (검증용)'));
  const tree = await render(environment);
  expect(texts(tree)).toContain('연결 확인 실패 (검증용)');
  expect(texts(tree)).not.toContain('예시 고객');
  await press(tree, '다시 시도');
  expect(restore).toHaveBeenCalledTimes(2);
  expect(texts(tree)).toContain('예시 고객');
});

it('잘못된 공개 사진 키가 전체 네이티브 화면을 중단시키지 않는다', async () => {
  const environment = createQaEnvironment({screen: 'mypage'}, 'data:image/png;base64,qa');
  environment.initialRoute = {name: 'home'};
  jest.spyOn(environment.services.publicContent, 'assetUrl').mockImplementation(() => {throw new Error('사진 접근 불가 (검증용)');});
  const tree = await render(environment);
  expect(texts(tree)).toContain('사진을 불러오지 못했어요.');
  expect(texts(tree)).toContain('눌러서 다시 불러오기');
  expect(tree.root.findAllByType(Button).some(row => row.props.label === '정비 예약')).toBe(true);
});
