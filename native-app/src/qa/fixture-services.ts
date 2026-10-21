import {NativeServices, Route} from '../components/AppContext';
import {Booking, BookingInput, GuestBookingInput} from '../domain/types';
import {createQaData, qaDate, qaProfile} from './fixture-data';
import {createQaSession} from './fixture-session';
import {createQaPush} from './fixture-push';
import {createQaAccount, createQaDeletion} from './fixture-account';
import {createQaNotifications} from './fixture-notifications';

export type QaConfiguration = {screen: 'booking' | 'mypage' | 'admin' | 'notifications' | 'updates' | 'setup' | 'setup-denied' | 'inbox' | 'detail' | 'customer'; requestOsPermission?: boolean};
export function createQaEnvironment(config: QaConfiguration, imageUri: string) {
  const admin = ['admin', 'notifications', 'inbox', 'detail'].includes(config.screen);
  const data = createQaData(), auth = createQaSession(admin), calls: string[] = [];
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
    session: auth.session,
    publicContent: {load: async () => clone(data.content), assetUrl: (_key: string) => imageUri, legacyAsset: async (_key: string) => null},
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
    account: createQaAccount(data, auth, scoped, imageUri, calls),
    notifications: createQaNotifications(data, push, calls),
    deletion: createQaDeletion(calls),
  } as unknown as NativeServices;
  const initialRoute: Route = config.screen === 'customer' ? {name: 'work-detail', id: 'qa-run'} : config.screen === 'booking' ? {name: 'reserve'} : ['mypage', 'updates', 'setup', 'setup-denied'].includes(config.screen) ? {name: 'my'} : config.screen === 'admin' ? {name: 'admin'} : config.screen === 'inbox' ? {name: 'notifications'} : config.screen === 'detail' ? {name: 'admin-booking', id: 'qa-pending'} : {name: 'notification-settings'};
  return {services, push, initialRoute, calls, data, qaDate, updates: config.screen === 'updates' ? {check: async () => ({key: 'qa-update', version: '2.0.0 (실제 발송 없음)'}), openStore: async () => {calls.push('updates.openStore');}} : undefined};
}
