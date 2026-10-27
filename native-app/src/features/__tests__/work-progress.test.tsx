import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act, ReactTestInstance, ReactTestRenderer} from 'react-test-renderer';
import App from '../../App';
import {Button} from '../../components/Controls';
import {Screen} from '../../components/Screen';
import {AssetImage} from '../../components/Media';
import {createQaEnvironment} from '../../qa/fixture-services';
import type {ServiceRun} from '../../domain/types';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
  SafeAreaView: require('react-native').View,
}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const trees: ReactTestRenderer[] = [];
function run(patch: Partial<ServiceRun> = {}): ServiceRun {
  return {id: 'own-run', memberId: 'qa-customer', bookingKey: 'qa-pending', branch: '프로모터스 안산점',
    serviceName: '검증 정비', service: '검증 정비', currentStep: 1, status: '작업 승인대기',
    bookingDate: '2026.03.01', bookingTime: '10:00', createdAt: '2026-03-01T00:00:00Z', steps: [
      {name: '입고 점검', approved: true, submitted: true, photoKeys: ['approved-photo'], note: '승인된 점검 안내'},
      {name: '부품 정비', approved: false, submitted: true, photoKeys: ['unapproved-photo'], note: '검수 전 안내는 비공개'},
      {name: '출고 확인', approved: false, submitted: false, photoKeys: [], note: ''},
    ], ...patch};
}
function text(node: ReactTestInstance) {
  return node.findAllByType(Text).map(row => [row.props.children].flat(Infinity)
    .filter(value => typeof value === 'string' || typeof value === 'number').map(String).join('')).join('\n');
}
function stage(tree: ReactTestRenderer, index: number) {
  const result = tree.root.findAll(node => node.props.testID === `work-stage-${index}`)[0];
  expect(result).toBeDefined();
  return result;
}
async function mount(runs: ServiceRun[], id?: string) {
  const environment = createQaEnvironment({screen: 'mypage'}, 'data:image/png;base64,qa');
  environment.data.runs.splice(0, environment.data.runs.length, ...runs);
  const assets = jest.spyOn(environment.services.account, 'assetUrl');
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={environment.services} push={environment.push}
    initialRoute={id ? {name: 'work-detail', id} : {name: 'work'}}/>);});
  trees.push(tree);
  return {tree, environment, assets};
}
async function press(tree: ReactTestRenderer, label: string) {
  const button = tree.root.findAllByType(Button).find(node => node.props.label === label);
  expect(button).toBeDefined();
  await act(async () => {await button!.props.onPress();});
}
beforeEach(() => {jest.useFakeTimers();});
afterEach(async () => {
  await act(async () => {trees.splice(0).forEach(tree => tree.unmount());});
  jest.useRealTimers(); jest.restoreAllMocks();
});

test('고객 정비 상세는 네 단계와 검수중 안내를 표시하고 승인된 사진만 요청한다', async () => {
  const {tree, assets} = await mount([run()], 'own-run');
  expect(text(stage(tree, 0))).toContain('입고');
  expect(text(stage(tree, 0))).toContain('완료');
  expect(text(stage(tree, 1))).toContain('작업');
  expect(text(stage(tree, 1))).toContain('완료');
  expect(text(stage(tree, 2))).toContain('검수');
  expect(text(stage(tree, 2))).toContain('진행중');
  expect(text(stage(tree, 2))).toContain('작업 결과를 검수하고 있어요');
  expect(text(stage(tree, 3))).toContain('확인');
  expect(text(stage(tree, 3))).toContain('대기');
  expect(text(tree.root)).toContain('사진 1장 검수 중');
  expect(text(tree.root)).toContain('승인된 점검 안내');
  expect(text(tree.root)).not.toContain('검수 전 안내는 비공개');
  expect(tree.root.findAllByType(AssetImage).map(node => node.props.assetKey)).toEqual(['approved-photo']);
  expect(assets.mock.calls.map(call => call[0])).toEqual(['approved-photo']);
});

test('입고 완료를 전체 정비 완료로 오인하지 않고 실제 현재 작업을 표시한다', async () => {
  const value = run({status: '입고 완료', steps: [
    {name: '입고 점검', approved: true, submitted: true, photoKeys: []},
    {name: '부품 정비', approved: false, submitted: false, photoKeys: []},
    {name: '출고 확인', approved: false, submitted: false, photoKeys: []},
  ]});
  const {tree} = await mount([value], value.id);
  expect(text(stage(tree, 0))).toContain('완료');
  expect(text(stage(tree, 1))).toContain('진행중');
  expect(text(stage(tree, 2))).toContain('대기');
  expect(text(stage(tree, 3))).toContain('대기');
  expect(text(tree.root)).not.toContain('작업이 완료되었어요. 차량을 확인해주세요');
});

test('정비 ID를 정확히 유지하며 연결된 예약과 정비 상세를 왕복한다', async () => {
  const own = run(), unrelated = run({id: 'another-run', serviceName: '선택하지 않은 정비'});
  const {tree} = await mount([own, unrelated], own.id);
  expect(text(tree.root)).not.toContain('선택하지 않은 정비');
  await press(tree, '예약 정보 보기');
  expect(tree.root.findAllByType(Screen).some(node => node.props.title === '예약 상세')).toBe(true);
  await press(tree, '검증 정비 · 정비내역 보기');
  expect(tree.root.findAllByType(Screen).some(node => node.props.title === '정비 상세')).toBe(true);
  expect(text(tree.root)).toContain('승인된 점검 안내');
  expect(text(tree.root)).not.toContain('선택하지 않은 정비');
});

test('작업사진 현황은 최신 정비를 대표로 보여주고 지난 기록은 상세로 열어 확인한다', async () => {
  const older = run({id: 'older-run', serviceName: '이전 정비', createdAt: '2026-02-01T00:00:00Z'});
  const latest = run({id: 'latest-run', serviceName: '최근 완료 정비', completedAt: '2026-03-01T01:00:00Z', status: '출고 완료'});
  const {tree} = await mount([older, latest]);
  expect(text(tree.root)).toContain('최근 완료 정비');
  expect(text(tree.root)).toContain('지난 작업기록');
  for (let index = 0; index < 4; index++) expect(text(stage(tree, index))).toContain('완료');
  const open = tree.root.findAll(node => node.props.accessibilityLabel === '이전 정비 작업사진 보기' && typeof node.props.onPress === 'function')[0];
  expect(open).toBeDefined();
  await act(async () => {open.props.onPress();});
  expect(tree.root.findAllByType(Screen).some(node => node.props.title === '정비 상세')).toBe(true);
  expect(text(tree.root)).not.toContain('최근 완료 정비');
  expect(text(tree.root)).toContain('이전 정비');
});
