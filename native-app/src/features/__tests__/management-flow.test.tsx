import React from 'react';
import {Alert, Text} from 'react-native';
import TestRenderer, {act, ReactTestRenderer} from 'react-test-renderer';
import App from '../../App';
import {Button, Choice, Field, MenuRow} from '../../components/Controls';
import {createQaEnvironment} from '../../qa/fixture-services';
import {ManagedRun} from '../../domain/management';
import {Role} from '../../domain/types';
import {Route} from '../../components/AppContext';

jest.mock('react-native-safe-area-context', () => ({SafeAreaProvider: ({children}: {children: React.ReactNode}) => children, SafeAreaView: require('react-native').View}));
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
const trees: ReactTestRenderer[] = [];
function fixture(role: Role = 'main') {
  const environment = createQaEnvironment({screen: 'admin'}, 'data:image/png;base64,qa');
  environment.services.session.snapshot().role = role;
  const profile = {id: 'qa-customer', name: '예시 고객', car: '차량번호 비공개', model: 'BMW 520d', phone: '01000000000'};
  const run: ManagedRun = {id: 'qa-run', bookingKey: 'qa-pending', branch: '프로모터스 안산점', memberId: profile.id, name: profile.name, car: profile.car,
    service: '엔진오일 교환', status: '입고 대기', currentStep: 0, steps: [{name: '입고', photoRequired: true, memoRequired: false, approvalRequired: true,
      photoKeys: [], memo: '', submitted: false, approved: false}]};
  const mocks = {
    work: {list: jest.fn(async () => ({runs: [run], bookings: environment.data.bookings.filter(row => row.branch === run.branch), products: [], branches: [run.branch]})),
      createFromBooking: jest.fn(async () => ({run, warnings: []})), saveStep: jest.fn(async () => ({run, warnings: []})),
      approveStep: jest.fn(async () => ({run, warnings: []})), rejectStep: jest.fn(async () => ({run, warnings: []})), revertStep: jest.fn(async () => ({run, warnings: []}))},
    assets: {pickAndUpload: jest.fn(async () => [] as string[])},
    customers: {list: jest.fn(async () => [profile]), get: jest.fn(async () => ({profile, file: {memoEntries: [], records: []}, bookings: [], runs: [run]})),
      saveMemo: jest.fn(async () => ({})), saveRecord: jest.fn(async () => ({})), restrict: jest.fn(async () => {})},
    content: {list: jest.fn(async () => ({branches: [], cases: [], notices: [], products: [], introSlides: []})),
      savePost: jest.fn(async () => ({})), saveProduct: jest.fn(async () => ({})), saveBranch: jest.fn(async () => ({})), saveIntro: jest.fn(async () => ({})),
      hours: jest.fn(async () => ({'프로모터스 안산점': {days: Object.fromEntries(Array.from({length: 7}, (_, day) => [String(day), {open: day !== 0, start: '10:00', end: '18:00'}]))}})),
      saveHours: jest.fn(async (_branch: string, _settings: unknown) => ({}))},
    promotions: {load: jest.fn(async () => ({coupons: [], assignments: [], couponUsage: [], events: [{id: 'qa-event', title: '예시 이벤트', status: 'draft', prize: '예시 경품'}], entries: []})),
      saveCoupon: jest.fn(async () => ({})), saveEvent: jest.fn(async () => ({})), issueCoupon: jest.fn(async () => ({issued: 1})), publishEvent: jest.fn(async () => ({}))},
    inquiries: {list: jest.fn(async () => []), thread: jest.fn(async () => ({selected: {id: 'qa-message', from: 'customer', message: '문의 예시', customer: profile},
      owner: profile.id, items: [{id: 'qa-message', from: 'customer', message: '문의 예시', createdAt: '예시 일시'}]})), reply: jest.fn(async () => ({}))},
  };
  Object.assign(environment.services, {adminWork: mocks.work, adminAssets: mocks.assets, adminCustomers: mocks.customers,
    adminContent: mocks.content, adminPromotions: mocks.promotions, adminInquiries: mocks.inquiries});
  return {...environment, mocks, run};
}
async function mount(environment: ReturnType<typeof fixture>, initialRoute: Route) {
  let tree!: ReactTestRenderer;
  await act(async () => {tree = TestRenderer.create(<App services={environment.services} push={environment.push} initialRoute={initialRoute}/>);});
  trees.push(tree); return tree;
}
async function press(tree: ReactTestRenderer, label: string) {
  const node = tree.root.findAllByType(Button).find(item => item.props.label === label);
  if (!node || node.props.disabled || node.props.busy) throw new Error('누를 수 없는 버튼: ' + label);
  await act(async () => {node.props.onPress();});
}
async function field(tree: ReactTestRenderer, label: string, text: string) {
  const node = tree.root.findAllByType(Field).find(item => item.props.label === label);
  if (!node) throw new Error('입력란 없음: ' + label);
  await act(async () => {node.props.onChangeText(text);});
}
function text(tree: ReactTestRenderer) {return tree.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).filter(value => typeof value === 'string').join('\n');}
beforeEach(() => {jest.useFakeTimers();});
afterEach(async () => {await act(async () => {trees.splice(0).forEach(tree => tree.unmount());}); jest.useRealTimers(); jest.restoreAllMocks();});

it('일반 관리자에게 작업·문의·시간 메뉴만 보여주며 메인 고객·콘텐츠·프로모션을 숨긴다', async () => {
  const environment = fixture('general'), tree = await mount(environment, {name: 'management'});
  const titles = tree.root.findAllByType(MenuRow).map(node => node.props.title);
  expect(titles).toEqual(['작업 진행 · 사진 관리', '고객 문의', '영업시간 · 휴무']);
  expect(environment.mocks.customers.list).not.toHaveBeenCalled();
  expect(environment.mocks.content.list).not.toHaveBeenCalled();
  expect(environment.mocks.promotions.load).not.toHaveBeenCalled();
});
it('메인 관리자에게 고객·콘텐츠·프로모션 네이티브 메뉴를 보여준다', async () => {
  const tree = await mount(fixture(), {name: 'management'});
  expect(tree.root.findAllByType(MenuRow).map(node => node.props.title)).toEqual(expect.arrayContaining(['고객 관리', '게시글 · 매장 정보', '쿠폰 · 이벤트']));
});
it('작업 사진 선택 취소와 업로드 실패 때 사진이나 저장 성공을 만들어내지 않는다', async () => {
  const environment = fixture(), tree = await mount(environment, {name: 'management', section: 'work', id: 'qa-run'});
  await press(tree, '사진첩에서 선택');
  expect(environment.mocks.assets.pickAndUpload).toHaveBeenCalledWith({source: 'library', prefix: 'service', branch: '프로모터스 안산점', runId: 'qa-run', limit: 30});
  expect(environment.mocks.work.saveStep).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(Button).filter(node => String(node.props.label).startsWith('사진 1 빼기'))).toHaveLength(0);
  environment.mocks.assets.pickAndUpload.mockRejectedValueOnce(new Error('사진 업로드 실패 (검증용)'));
  await press(tree, '사진첩에서 선택'); expect(text(tree)).toContain('사진 업로드 실패 (검증용)');
  expect(text(tree)).not.toContain('저장했어요.'); expect(environment.mocks.work.saveStep).not.toHaveBeenCalled();
});
it('단계 저장이 서버에서 실패하면 완료로 표시하지 않고 입력값을 보존한다', async () => {
  const environment = fixture(); environment.mocks.work.saveStep.mockRejectedValueOnce(new Error('단계 저장 실패 (검증용)'));
  const tree = await mount(environment, {name: 'management', section: 'work', id: 'qa-run'});
  await field(tree, '특이사항', '예시 특이사항'); await field(tree, '입고 주행거리(km)', '58000'); await press(tree, '사진·메모 저장');
  expect(environment.mocks.work.saveStep).toHaveBeenCalledWith('qa-run', 0, {photoKeys: [], memo: '예시 특이사항', mileage: '58000', submit: false});
  expect(text(tree)).toContain('단계 저장 실패 (검증용)'); expect(text(tree)).not.toContain('저장했어요.');
  expect(tree.root.findAllByType(Field).find(node => node.props.label === '특이사항')?.props.value).toBe('예시 특이사항');
});
it('고객 메모 저장 실패를 성공으로 표시하지 않는다', async () => {
  const environment = fixture(); environment.mocks.customers.saveMemo.mockRejectedValueOnce(new Error('고객 메모 저장 실패 (검증용)'));
  const tree = await mount(environment, {name: 'management', section: 'customers', id: 'qa-customer'});
  await field(tree, '메모 제목', '예시 상담'); await field(tree, '메모 내용', '예시 상담 내용'); await press(tree, '메모 추가');
  expect(environment.mocks.customers.saveMemo).toHaveBeenCalledWith('qa-customer', {id: undefined, title: '예시 상담', body: '예시 상담 내용'});
  expect(text(tree)).toContain('고객 메모 저장 실패 (검증용)'); expect(text(tree)).not.toContain('저장했어요.');
});
it('게시글은 공개 확인 전 서버를 호출하지 않으며 실패 시 편집 화면을 유지한다', async () => {
  const environment = fixture(); environment.mocks.content.savePost.mockRejectedValueOnce(new Error('게시글 저장 실패 (검증용)'));
  const tree = await mount(environment, {name: 'management', section: 'content', id: 'notice:new'});
  await field(tree, '제목', '예시 공지'); await field(tree, '본문', '예시 본문');
  let approve: (() => void) | undefined;
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {approve = buttons?.find(button => button.text === '저장')?.onPress as () => void;});
  await press(tree, '내용 저장'); expect(environment.mocks.content.savePost).not.toHaveBeenCalled();
  await act(async () => {approve?.();});
  expect(environment.mocks.content.savePost).toHaveBeenCalledTimes(1); expect(text(tree)).toContain('게시글 저장 실패 (검증용)');
  expect(text(tree)).toContain('공지 편집'); expect(text(tree)).not.toContain('저장했어요.');
});
it('영업시간 편집에 담당 지점만 표시하고 지정 지점 설정만 보낸다', async () => {
  const environment = fixture('general'), tree = await mount(environment, {name: 'management', section: 'hours'});
  expect(text(tree)).toContain('프로모터스 안산점'); expect(text(tree)).not.toContain('프로모터스 새솔점'); expect(text(tree)).not.toContain('프로모터스 부천점');
  await press(tree, '영업시간 저장'); expect(environment.mocks.content.saveHours).toHaveBeenCalledTimes(1);
  expect(environment.mocks.content.saveHours.mock.calls[0]?.[0]).toBe('프로모터스 안산점'); expect(text(tree)).toContain('영업시간을 저장했어요.');
});
it('이벤트는 명시적으로 공개를 확인한 경우에만 공개 호출한다', async () => {
  const environment = fixture(), tree = await mount(environment, {name: 'management', section: 'promotions'});
  expect(environment.mocks.promotions.publishEvent).not.toHaveBeenCalled(); let approve: (() => void) | undefined;
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {approve = buttons?.find(button => button.text === '변경')?.onPress as () => void;});
  await press(tree, '회원에게 공개'); expect(environment.mocks.promotions.publishEvent).not.toHaveBeenCalled();
  await act(async () => {approve?.();}); expect(environment.mocks.promotions.publishEvent).toHaveBeenCalledWith('qa-event', true);
});
it('문의 알림의 메시지 ID로 대화를 열며 답변 실패 시 입력을 지우지 않는다', async () => {
  const environment = fixture(); environment.mocks.inquiries.reply.mockRejectedValueOnce(new Error('답변 저장 실패 (검증용)'));
  const tree = await mount(environment, {name: 'management', section: 'inquiries', id: 'qa-message'});
  expect(environment.mocks.inquiries.thread).toHaveBeenCalledWith('qa-message'); await field(tree, '답변', '예시 답변'); await press(tree, '답변 보내기');
  expect(environment.mocks.inquiries.reply).toHaveBeenCalledWith('qa-message', '예시 답변'); expect(text(tree)).toContain('답변 저장 실패 (검증용)');
  expect(tree.root.findAllByType(Field).find(node => node.props.label === '답변')?.props.value).toBe('예시 답변');
});
