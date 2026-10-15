import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act, ReactTestRenderer} from 'react-test-renderer';
import App from '../../App';
import {Button, Field} from '../../components/Controls';
import {createQaEnvironment} from '../../qa/fixture-services';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
  SafeAreaView: require('react-native').View,
}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const trees: ReactTestRenderer[] = [];
const text = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).join('\n');
async function render(environment: ReturnType<typeof createQaEnvironment>) {
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={environment.services} push={environment.push} initialRoute={environment.initialRoute}/>);});
  trees.push(tree); return tree;
}
async function press(tree: ReactTestRenderer, label: string) {
  const button = tree.root.findAllByType(Button).find(node => node.props.label === label);
  if (!button || button.props.disabled || button.props.busy) throw new Error('Unavailable: ' + label);
  await act(async () => {await button.props.onPress();});
}
beforeEach(() => jest.useFakeTimers());
afterEach(async () => {await act(async () => {trees.splice(0).forEach(tree => tree.unmount());}); jest.useRealTimers(); jest.restoreAllMocks();});

it('대기 카드에서 상세 이동 없이 사유를 입력해 거절하고 최신 목록에서 제거한다', async () => {
  const environment = createQaEnvironment({screen: 'admin'}, 'data:image/png;base64,qa');
  const reject = jest.spyOn(environment.services.adminBookings, 'reject');
  const tree = await render(environment);
  await press(tree, '예약 거절');
  expect(text(tree)).not.toContain('예약 전체 정보');
  const reason = tree.root.findAllByType(Field).find(node => node.props.label === '거절 사유');
  expect(reason).toBeDefined();
  await act(async () => {reason!.props.onChangeText('해당 시간 정비 일정 마감');});
  await press(tree, '거절 확정');
  expect(reject).toHaveBeenCalledWith('qa-pending', '해당 시간 정비 일정 마감');
  expect(environment.data.bookings.find(row => row.id === 'qa-pending')?.status).toBe('취소');
  expect(tree.root.findAllByType(Button).filter(node => node.props.label === '예약 승인')).toHaveLength(0);
});

it('서버의 메인관리자 표시가 false여도 지점 관리자는 알림함에서 예약을 승인한다', async () => {
  const environment = createQaEnvironment({screen: 'admin'}, 'data:image/png;base64,qa');
  environment.data.notificationState.admin = false;
  const accept = jest.spyOn(environment.services.adminBookings, 'accept');
  const tree = await render(environment);
  await press(tree, '알림');
  expect(text(tree)).toContain('프로모터스 알림');
  await press(tree, '예약 승인');
  expect(accept).toHaveBeenCalledWith('qa-pending');
  expect(environment.data.bookings.find(row => row.id === 'qa-pending')?.status).toBe('예약');
  expect(tree.root.findAllByType(Button).filter(node => node.props.label === '예약 승인')).toHaveLength(0);
});

it('처리된 알림을 누른 지점 관리자는 관리자 예약 상세와 고객 기록을 본다', async () => {
  const environment = createQaEnvironment({screen: 'admin'}, 'data:image/png;base64,qa');
  environment.data.notificationState.admin = false;
  environment.data.bookings.find(row => row.id === 'qa-pending')!.status = '예약';
  const tree = await render(environment);
  await press(tree, '알림');
  expect(tree.root.findAllByType(Button).filter(node => node.props.label === '예약 승인')).toHaveLength(0);
  const row = tree.root.findAll(node => node.props.testID === 'notification-open-qa-alert' && typeof node.props.onPress === 'function')[0];
  expect(row).toBeDefined();
  await act(async () => {await row!.props.onPress();});
  expect(text(tree)).toContain('예약 전체 정보');
  expect(text(tree)).toContain('기존 고객 기록');
});

it('고객 알림함에는 서버 표시와 무관하게 관리자 처리 버튼을 만들지 않는다', async () => {
  const environment = createQaEnvironment({screen: 'mypage'}, 'data:image/png;base64,qa');
  environment.data.notificationState.admin = true;
  environment.initialRoute = {name: 'notifications'};
  const list = jest.spyOn(environment.services.adminBookings, 'list');
  const tree = await render(environment);
  expect(list).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(Button).filter(node => ['예약 승인', '예약 거절'].includes(node.props.label))).toHaveLength(0);
});
