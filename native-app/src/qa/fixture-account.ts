import {DeletionState, Inquiry, JsonRecord, Promotions} from '../domain/types';
import {createQaData, qaProfile} from './fixture-data';
import {createQaSession} from './fixture-session';

export function createQaAccount(data: ReturnType<typeof createQaData>, auth: ReturnType<typeof createQaSession>, scoped: () => typeof data.bookings, imageUri: string, calls: string[]) {
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const promotions: Promotions = {
    coupons: [{id: 'qa-coupon', name: '정비 점검 혜택', benefit: '매장에서 상세 내용을 확인해 주세요.', startDate: '2026-01-01', endDate: '2027-12-31'}],
    assignments: [{id: 'qa-assignment', couponId: 'qa-coupon', memberId: qaProfile.id}], couponUsage: [],
    events: [{id: 'qa-event', title: '프로모터스 회원 이벤트 (예시)', status: 'published', prize: '정비 혜택', startDate: '2026-01-01', endDate: '2027-12-31'}], entries: [],
  };
  const messages: Inquiry[] = [{id: 'qa-message', from: 'admin', message: '차량 점검 후 작업사진을 전달드리겠습니다. 예시 메시지입니다.', createdAt: new Date().toISOString(), memberId: qaProfile.id}];
  return {
    load: async () => ({profile: auth.session.snapshot().profile, bookings: clone(scoped()), runs: clone(data.runs), messages: clone(messages)}),
    assetUrl: async (_key: string) => imageUri,
    promotions: async () => clone(promotions),
    sendInquiry: async (message: string) => {calls.push('inquiry'); messages.push({id: 'qa-inquiry-' + messages.length, from: 'customer', message, memberId: qaProfile.id, createdAt: new Date().toISOString()});},
    updateProfile: async (profile: JsonRecord) => {calls.push('profile'); auth.update({profile: {...qaProfile, ...profile}});},
    changePassword: async (_current: string, _next: string) => {calls.push('password');},
    useCoupon: async (id: string, _branch?: string) => {calls.push('coupon'); promotions.assignments = promotions.assignments.filter(row => row.id !== id);},
    enterEvent: async (_id: string, _numbers: number[]) => {calls.push('event'); return {winner: false};},
  };
}
export function createQaDeletion(calls: string[]) {
  let deletion: DeletionState = {status: 'none', canCancel: false};
  return {
    state: async () => ({...deletion}), receipt: async () => ({...deletion}),
    request: async (_password: string) => {calls.push('deletion:request'); deletion = {status: 'pending', canCancel: true, requestedAt: new Date().toISOString(), scheduledFor: new Date(Date.now() + 72 * 3600000).toISOString()}; return {...deletion};},
    cancel: async () => {calls.push('deletion:cancel'); deletion = {status: 'cancelled', canCancel: false}; return {...deletion};},
  };
}
