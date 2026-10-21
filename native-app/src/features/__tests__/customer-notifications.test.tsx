import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import App from '../../App';
import {routeForNotification} from '../notifications/NotificationsScreen';
import {createQaEnvironment} from '../../qa/fixture-services';
import {runStage} from '../account/runDisplay';
jest.mock('react-native-safe-area-context', () => ({SafeAreaProvider: ({children}: {children: React.ReactNode}) => children, SafeAreaView: require('react-native').View}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
function text(tree: TestRenderer.ReactTestRenderer) {return tree.root.findAllByType(Text).flatMap(row => row.props.children).flat(Infinity).join(' ');}
test('고객 정비 알림은 전체 목록이 아닌 해당 정비 상세로 이동한다', () => {
  expect(routeForNotification({kind: 'repair', id: 'own-run'}, false)).toEqual({name: 'work-detail', id: 'own-run'});
});
test('입고 완료는 정비 완료로 표시하지 않는다', () => {
  expect(runStage({id: 'r', status: '입고 완료', steps: [{approved: true}, {approved: false}]})).toBeLessThan(4);
  expect(runStage({id: 'r', status: '출고 완료'})).toBe(4);
});
test('해당 고객 정비·승인된 사진만 열고 연결 예약으로 이동할 수 있다', async () => {
  const env = createQaEnvironment({screen: 'mypage'}, 'data:image/png;base64,qa');
  env.data.runs[0].bookingKey = 'qa-pending';
  env.data.runs.push({...env.data.runs[0], id: 'another-run', serviceName: '다른 정비는 표시 금지'});
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={env.services} push={env.push} initialRoute={routeForNotification({kind: 'repair', id: 'qa-run'}, false)}/>);});
  expect(text(tree)).toContain('차량 상태를 점검했습니다.');
  expect(text(tree)).not.toContain('다른 정비는 표시 금지');
  expect(text(tree)).toContain('예약 정보 보기');
  await act(async () => tree.unmount());
});
test('존재하지 않는 정비 ID로 다른 정비를 대신 보여주지 않는다', async () => {
  const env = createQaEnvironment({screen: 'mypage'}, 'data:image/png;base64,qa');
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={env.services} push={env.push} initialRoute={routeForNotification({kind: 'repair', id: 'not-owned'}, false)}/>);});
  expect(text(tree)).toContain('정비 내역을 찾을 수 없습니다.');
  expect(text(tree)).not.toContain('차량 상태를 점검했습니다.');
  await act(async () => tree.unmount());
});
