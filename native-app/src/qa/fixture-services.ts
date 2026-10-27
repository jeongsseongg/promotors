import {NativeServices, Route} from '../components/AppContext';
import {Booking, BookingInput, GuestBookingInput, Inquiry} from '../domain/types';
import type {ManagedRun, WorkList, WorkStep} from '../domain/management';
import {createQaData, qaDate, qaProfile} from './fixture-data';
import {createQaSession} from './fixture-session';
import {createQaPush} from './fixture-push';
import {createQaAccount, createQaDeletion} from './fixture-account';
import {createQaNotifications} from './fixture-notifications';
import {parseWorkshopFeed} from '../api/workshop-feed';

function verifyNativeFeedRuntime() {
  const sample = '<rss><channel><item><title>안산 공개 정비사례</title><link>https://blog.naver.com/lsh861124/123456</link><description><![CDATA[<img src="https://blogthumb.pstatic.net/example.jpg">]]></description></item></channel></rss>';
  const posts = parseWorkshopFeed(sample, [{key: 'ansan', branch: '프로모터스 안산점', keywords: ['안산']}]);
  if (posts.length !== 1 || posts[0].imageUrls?.length !== 1) throw new Error('네이티브 정비사례 읽기 검증에 실패했습니다.');
}

export type QaConfiguration = {screen: 'home' | 'booking' | 'mypage' | 'admin' | 'notifications' | 'updates' | 'setup' | 'setup-denied' | 'inbox' | 'detail' | 'customer' | 'login' | 'guest-booking' | 'admin-mypage'; requestOsPermission?: boolean};
function qaInitialRoute(screen: QaConfiguration['screen']): Route {
  if (screen === 'home') return {name: 'home'};
  if (screen === 'login') return {name: 'login'};
  if (screen === 'booking' || screen === 'guest-booking') return {name: 'reserve'};
  if (['mypage', 'customer', 'updates', 'setup', 'setup-denied', 'admin-mypage'].includes(screen)) return {name: 'my'};
  if (screen === 'admin') return {name: 'admin'};
  if (screen === 'inbox') return {name: 'notifications'};
  if (screen === 'detail') return {name: 'admin-booking', id: 'qa-pending'};
  return {name: 'notification-settings'};
}
function qaWorkList(data: ReturnType<typeof createQaData>): WorkList {
  const runs: ManagedRun[] = data.runs.map(run => ({...run, branch: String(run.branch || ''), bookingKey: String(run.bookingKey || 'qa-pending'),
    currentStep: Number(run.currentStep || 0), name: qaProfile.name, model: qaProfile.model, car: qaProfile.car,
    steps: (Array.isArray(run.steps) ? run.steps : []).map((step: Partial<WorkStep>) => ({...step, name: String(step.name || ''),
      photoRequired: !!step.photoRequired, memoRequired: !!step.memoRequired, approvalRequired: !!step.approvalRequired,
      photoKeys: Array.isArray(step.photoKeys) ? step.photoKeys : [], memo: String(step.memo || step.note || ''), submitted: !!step.submitted, approved: !!step.approved}))}));
  return {runs, bookings: data.bookings, branches: data.content.branches.map(branch => branch.name),
    products: data.content.products.map(row => ({...row, name: String(row.name || ''), steps: []}))};
}
function prepareDashboardData(config: QaConfiguration, data: ReturnType<typeof createQaData>) {
  if (config.screen !== 'admin-mypage') return;
  data.bookings[0].date = qaDate();
  data.bookings[1].date = qaDate(); data.bookings[1].branch = '프로모터스 안산점';
  const steps = data.runs[0].steps as {submitted: boolean}[];
  steps[1].submitted = true;
}
export function createQaEnvironment(config: QaConfiguration, imageUri: string) {
  const admin = ['admin', 'notifications', 'inbox', 'detail', 'admin-mypage'].includes(config.screen);
  const data = createQaData(), auth = createQaSession(admin, ['login', 'guest-booking'].includes(config.screen)), calls: string[] = [];
  let rememberedId = ''; prepareDashboardData(config, data);
  data.notificationState.admin = admin;
  if (config.screen === 'customer') {data.bookings[0].status = '예약'; data.runs[0].bookingKey = 'qa-pending';}
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const requireBooking = (id: string) => {const row = data.bookings.find(item => item.id === id); if (!row) throw new Error('예약을 찾을 수 없습니다.'); return row;};
  const scoped = () => data.bookings.filter(row => admin ? row.branch === '프로모터스 안산점' : row.memberId === qaProfile.id);
  async function create(input: BookingInput | GuestBookingInput) {
    calls.push('booking:create');
    const row: Booking = {id: 'qa-created', ...input, status: '신규', memberId: qaProfile.id, name: qaProfile.name, car: qaProfile.car, model: qaProfile.model};
    data.bookings.push(row); return clone(row);
  }
  async function cancel(id: string) {calls.push('booking:cancel'); const row = requireBooking(id); row.status = '취소'; return clone(row);}
  async function decide(id: string, reject = false, reason = '') {
    calls.push(reject ? 'booking:reject' : 'booking:accept');
    const booking = requireBooking(id), changed = ['신규', '승인대기'].includes(booking.status);
    if (changed) {booking.status = reject ? '취소' : '예약'; if (reject) booking.rejectionReason = reason;}
    return {booking: clone(booking), customerContext: clone(data.customerContext), changed};
  }
  const push = createQaPush(!!config.requestOsPermission, enabled => {data.notificationState.preferences.enabled = enabled;}, config.screen.startsWith('setup'), config.screen === 'setup-denied');
  const services = {
    session: auth.session, rememberedLogin: {read: async () => rememberedId, write: async (value: string | null) => {rememberedId = value || ''; }},
    publicContent: {load: async () => clone(data.content), caseFeed: async () => {verifyNativeFeedRuntime(); return clone(data.content);}, assetUrl: (_key: string) => imageUri, legacyAsset: async (_key: string) => null},
    bookings: {
      list: async () => clone(scoped()),
      hours: async () => Object.fromEntries(data.content.branches.map(branch => [branch.name, {days: Object.fromEntries(Array.from({length: 7}, (_, day) => [String(day), {open: day !== 0, start: '09:30', end: '19:00'}])), lunchEnabled: true, lunchStart: '12:00', lunchEnd: '13:00', closedDates: []}])),
      availability: async (branch: string, from: string, to: string) => data.bookings.filter(row => row.branch === branch && row.date >= from && row.date <= to && !['취소', '완료'].includes(row.status)).map(row => ({date: row.date, time: row.time})),
      create, cancel, update: async () => {throw new Error('예약 일정은 취소 후 다시 신청해 주세요.');},
    },
    guest: {create, lookup: async (_phone: string, _pin: string) => clone(data.bookings[0]), cancel: async (id: string, _phone: string, _pin: string) => cancel(id)},
    adminBookings: {
      list: async () => ({items: clone(scoped().filter(row => ['신규', '승인대기'].includes(row.status))), upcoming: clone(scoped().filter(row => row.status === '예약'))}),
      schedule: async () => clone(scoped()), get: async (id: string) => ({booking: clone(requireBooking(id)), customerContext: clone(data.customerContext)}),
      accept: (id: string) => decide(id), reject: (id: string, reason: string) => decide(id, true, reason),
    },
    adminWork: {list: async () => clone(qaWorkList(data))},
    adminInquiries: {list: async (): Promise<Inquiry[]> => [{id: 'qa-my-inquiry', memberId: qaProfile.id, branch: '프로모터스 안산점', from: 'customer', message: '방문 일정 문의 예시입니다.', createdAt: new Date().toISOString()}]},
    account: createQaAccount(data, auth, scoped, imageUri, calls),
    notifications: createQaNotifications(data, push, calls),
    deletion: createQaDeletion(calls),
  } as unknown as NativeServices;
  const initialRoute = qaInitialRoute(config.screen);
  return {services, push, initialRoute, calls, data, qaDate, updates: config.screen === 'updates' ? {check: async () => ({key: 'qa-update', version: '2.0.0 (실제 발송 없음)'}), openStore: async () => {calls.push('updates.openStore');}} : undefined};
}
