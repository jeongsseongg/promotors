import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act, ReactTestRenderer} from 'react-test-renderer';
import App from '../../App';
import {NativeServices} from '../../components/AppContext';
import {MenuRow} from '../../components/Controls';
import {Screen} from '../../components/Screen';
import type {Booking, Inquiry, SessionSnapshot} from '../../domain/types';
import type {ManagedRun, WorkList} from '../../domain/management';
import {createQaEnvironment} from '../../qa/fixture-services';
import {adminDashboardSnapshot} from '../account/AdminMyDashboard';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
  SafeAreaView: require('react-native').View,
}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const ANSAN = '프로모터스 안산점', SAESOL = '프로모터스 새솔점';
const today = '2026.03.01', now = new Date('2026-02-28T15:00:00.000Z');
const trees: ReactTestRenderer[] = [];

function manager(patch: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {status: 'signedIn', authenticated: true, role: 'main', branches: [],
    profile: {id: 'synthetic-admin'}, privacyEpoch: 1, expiresAt: null, deletionPending: false, revision: 1, ...patch};
}
function booking(id: string, patch: Partial<Booking> = {}): Booking {
  return {id, date: today, time: '10:00', status: '예약', branch: ANSAN, memberId: 'synthetic-member', ...patch};
}
function run(id: string, patch: Partial<ManagedRun> = {}): ManagedRun {
  return {id, branch: ANSAN, bookingKey: '', memberId: 'synthetic-member', status: '작업중', currentStep: 0,
    steps: [{name: '점검', photoRequired: false, memoRequired: false, approvalRequired: true,
      photoKeys: [], memo: '', submitted: false, approved: false}], ...patch};
}
function work(bookings: Booking[] = [], runs: ManagedRun[] = []): WorkList {
  return {bookings, runs, products: [], branches: [ANSAN, SAESOL]};
}
function inquiry(id: string, patch: Partial<Inquiry> = {}): Inquiry {
  return {id, memberId: 'owner-' + id, branch: ANSAN, from: 'customer', message: '검증용 문의',
    createdAt: '2026-02-28T15:00:00.000Z', ...patch};
}
function labels(tree: ReactTestRenderer) {
  return tree.root.findAllByType(Text).map(node => [node.props.children].flat(Infinity)
    .filter(value => typeof value === 'string' || typeof value === 'number').map(String).join(''));
}
async function mount(options: {fail?: boolean} = {}) {
  const environment = createQaEnvironment({screen: 'admin'}, 'data:image/png;base64,qa');
  const data = work([booking('my-booking', {status: '신규'})], [run('my-run')]);
  const list = jest.fn(async () => {if (options.fail) throw new Error('운영 현황 조회 실패'); return data;});
  const services = {...environment.services,
    adminWork: {...environment.services.adminWork, list},
    adminInquiries: {...environment.services.adminInquiries, list: jest.fn(async () => [])},
  } as unknown as NativeServices;
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={services} push={environment.push} initialRoute={{name: 'my'}}/>);});
  trees.push(tree);
  return {tree, list, environment};
}
async function menu(tree: ReactTestRenderer, title: string) {
  const row = tree.root.findAllByType(MenuRow).find(node => node.props.title === title);
  expect(row).toBeDefined();
  await act(async () => {await row!.props.onPress();});
}
beforeEach(() => {jest.useFakeTimers(); jest.setSystemTime(now);});
afterEach(async () => {
  await act(async () => {trees.splice(0).forEach(tree => tree.unmount());});
  jest.useRealTimers(); jest.restoreAllMocks();
});

test('한국 자정 경계에서 오늘 예약과 출고를 같은 한국 날짜로 집계한다', () => {
  const data = work([booking('before', {date: '2026.02.28', status: '신규'}), booking('after')], [
    run('completed-before', {completedAt: '2026-02-28T14:59:59.000Z'}),
    run('completed-after', {completedAt: '2026-02-28T15:00:00.000Z'}),
  ]);
  const before = adminDashboardSnapshot(data, manager(), [], new Date('2026-02-28T14:59:59.000Z'));
  const after = adminDashboardSnapshot(data, manager(), [], now);
  expect(before).toMatchObject({todayCount: 1, newCount: 1, confirmedCount: 0, completedCount: 1});
  expect(after).toMatchObject({todayCount: 1, newCount: 0, confirmedCount: 1, completedCount: 1});
  expect(before.nextBooking?.id).toBe('before');
  expect(after.nextBooking?.id).toBe('after');
});

test('상태별 집계와 다음 예약은 취소·거절·완료·이력 전용 예약을 제외한다', () => {
  const data = work([
    booking('confirmed', {time: '12:00'}), booking('new', {time: '11:00', status: '신규'}),
    booking('pending-first', {time: '10:00', status: '승인대기'}),
    ...['취소', '거절', '완료', '출고 완료'].map((status, i) => booking('excluded-' + i, {time: '09:00', status})),
    booking('history', {time: '08:00', historyOnly: true}), booking('yesterday', {date: '2026.02.28'}),
  ], [run('working'), run('approval', {steps: [{...run('base').steps[0], submitted: true}]}),
    run('completed', {completedAt: '2026-02-28T15:30:00.000Z'}),
    run('completed-fallback', {status: '완료', updatedAt: '2026-03-01T00:00:00+09:00'}),
    run('older-complete', {completedAt: '2026-02-27T12:00:00Z'})]);
  const result = adminDashboardSnapshot(data, manager(), [], now);
  expect(result).toMatchObject({todayCount: 3, newCount: 2, confirmedCount: 1, activeCount: 2,
    approvalCount: 1, completedCount: 2, confirmationRate: 33});
  expect(result.nextBooking?.id).toBe('pending-first');
});

test('지점 관리자는 담당 지점의 예약·작업·승인·다음 입고만 집계한다', () => {
  const data = work([booking('visible', {time: '11:00'}), booking('outside', {branch: SAESOL, time: '09:00', status: '신규'})], [
    run('visible-run'), run('outside-run', {branch: SAESOL, steps: [{...run('base').steps[0], submitted: true}]}),
  ]);
  const scoped = adminDashboardSnapshot(data, manager({role: 'general', branches: [ANSAN]}), [], now);
  expect(scoped).toMatchObject({todayCount: 1, newCount: 0, confirmedCount: 1, activeCount: 1, approvalCount: 0, branchLabel: ANSAN});
  expect(scoped.nextBooking?.id).toBe('visible');
  expect(adminDashboardSnapshot(data, manager(), [], now)).toMatchObject({todayCount: 2, activeCount: 2, approvalCount: 1, branchLabel: '전체 지점'});
});

test('담당 지점이 없으면 전체 지점으로 확대하지 않고 고객·비로그인 집계도 거부한다', () => {
  const data = work([booking('hidden')], [run('hidden-run')]);
  expect(adminDashboardSnapshot(data, manager({role: 'general'}), [], now))
    .toMatchObject({todayCount: 0, activeCount: 0, nextBooking: undefined, branchLabel: '담당 지점 없음'});
  expect(() => adminDashboardSnapshot(data, manager({role: 'customer'}), [], now)).toThrow('관리자로 로그인해 주세요.');
  expect(() => adminDashboardSnapshot(data, manager({authenticated: false}), [], now)).toThrow('관리자로 로그인해 주세요.');
});

test('같은 고객이어도 명시된 문의 지점이 외부 지점이면 담당 고객 기록으로 우회하지 않는다', () => {
  const data = work([booking('assigned', {memberId: 'shared-owner'})]);
  const messages = [inquiry('outside', {memberId: 'shared-owner', branch: SAESOL})];
  const result = adminDashboardSnapshot(data, manager({role: 'general', branches: [ANSAN]}), messages, now);
  expect(result.inquiryCount).toBe(0);
});

test('지점이 없는 기존 문의는 담당 고객과 연결된 경우에만 집계한다', () => {
  const data = work([booking('assigned', {memberId: 'assigned-owner'})]);
  const messages = [inquiry('linked', {memberId: 'assigned-owner', branch: undefined}),
    inquiry('unrelated', {memberId: 'other-owner', branch: undefined})];
  expect(adminDashboardSnapshot(data, manager({role: 'general', branches: [ANSAN]}), messages, now).inquiryCount).toBe(1);
});

test('문의는 최종 답변 기준으로 집계하고 정비 작업 대화는 제외한다', () => {
  const messages = [inquiry('older', {memberId: 'answered-owner'}),
    inquiry('reply', {memberId: 'answered-owner', from: 'admin', createdAt: '2026-02-28T15:01:00Z'}),
    inquiry('waiting'), inquiry('work-chat', {serviceContext: {runId: 'test-run'}})];
  expect(adminDashboardSnapshot(work(), manager(), messages, now).inquiryCount).toBe(1);
});

test('실제 마이 경로에서 관리자 현황을 불러오고 상단 알림으로 이동한다', async () => {
  const {tree, list} = await mount();
  expect(list).toHaveBeenCalledTimes(1);
  expect(labels(tree)).toContain('오늘 예약 1건');
  expect(tree.root.findAllByType(Screen).some(node => node.props.title === '마이페이지' && node.props.hideHeader === true)).toBe(true);
  const bell = tree.root.findAll(node => node.props.testID === 'my-notifications' && typeof node.props.onPress === 'function')[0];
  expect(bell).toBeDefined();
  await act(async () => {bell.props.onPress();});
  expect(tree.root.findAllByType(Screen).some(node => node.props.title === '알림')).toBe(true);
  expect(tree.root.findAllByType(Screen).some(node => node.props.title === '마이페이지')).toBe(false);
});

test('실제 관리자 마이 메뉴에서 예약관리와 작업현황 화면으로 이동한다', async () => {
  const first = await mount();
  await menu(first.tree, '예약관리');
  expect(first.tree.root.findAllByType(Screen).some(node => node.props.title === '예약관리')).toBe(true);
  const second = await mount();
  await menu(second.tree, '작업현황');
  expect(second.tree.root.findAllByType(Screen).some(node => node.props.title === '작업 진행 · 사진')).toBe(true);
});

test('실제 운영 현황 조회가 실패하면 가짜 0건 대시보드를 표시하지 않는다', async () => {
  const {tree} = await mount({fail: true});
  expect(labels(tree)).toContain('운영 현황 조회 실패');
  expect(labels(tree)).not.toContain('오늘 예약 0건');
  expect(tree.root.findAll(node => node.props.testID === 'admin-my-dashboard')).toHaveLength(0);
});
