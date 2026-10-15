import {Booking, CustomerContext, MemberProfile, NotificationState, PublicContent, ServiceRun} from '../domain/types';
import {dateKey} from '../features/booking/Calendar';

export const qaProfile: MemberProfile = {id: 'qa-customer', name: '예시 고객', model: 'BMW 520d', car: '차량번호 비공개', phone: '01000000000'};
export function qaDate(offset = 0) {const day = new Date(); day.setDate(day.getDate() + offset); return dateKey(day);}
export function createQaData() {
  const bookings: Booking[] = [
    {id: 'qa-pending', branch: '프로모터스 안산점', date: qaDate(1), time: '10:00', status: '신규', memberId: qaProfile.id, name: qaProfile.name, model: qaProfile.model, car: qaProfile.car, phone: '', services: ['엔진오일 교환'], memo: '정비 전 점검도 함께 부탁드립니다.'},
    {id: 'qa-upcoming', branch: '프로모터스 새솔점', date: qaDate(2), time: '11:00', status: '예약', name: '예시 예약자', model: 'MINI Cooper', car: '차량번호 비공개', phone: '', services: ['차량 점검'], memo: '방문 일정 예시입니다.'},
    {id: 'qa-complete', branch: '프로모터스 안산점', date: qaDate(-20), time: '14:00', status: '완료', memberId: qaProfile.id, name: qaProfile.name, model: qaProfile.model, car: qaProfile.car, phone: '', services: ['브레이크 점검']},
  ];
  const runs: ServiceRun[] = [
    {id: 'qa-run', memberId: qaProfile.id, branch: '프로모터스 안산점', serviceName: '엔진오일 교환', service: '엔진오일 교환', status: '작업중', currentStep: 1, bookingDate: qaDate(), bookingTime: '10:00', mileage: 58000, steps: [
      {name: '입고 점검', submitted: true, approved: true, photoKeys: ['qa-workshop'], note: '차량 상태를 점검했습니다.'},
      {name: '엔진오일 교환', submitted: false, approved: false, photoKeys: [], note: ''},
      {name: '최종 검수', submitted: false, approved: false, photoKeys: [], note: ''},
    ]},
  ];
  const content: PublicContent = {
    branches: [
      {name: '프로모터스 안산점', addr: '경기도 안산시 단원구 이삭로 6', tel: '031-831-9738', imageKey: 'qa-workshop'},
      {name: '프로모터스 새솔점', addr: '새솔점 위치 예시', tel: '', imageKey: 'qa-workshop'},
      {name: '프로모터스 부천점', addr: '부천점 위치 예시', tel: '', imageKey: 'qa-workshop'},
    ],
    cases: [{id: 'qa-case', title: 'BMW 520d · 엔진오일 교환', branch: '프로모터스 안산점', date: qaDate(), imageKeys: ['qa-workshop'], body: '차량 상태를 점검하고 정해진 절차에 따라 엔진오일과 필터를 교환했습니다. 예시 화면입니다.'}],
    notices: [{id: 'qa-notice', title: '프로모터스 앱 이용 안내', date: qaDate(), body: '방문 예약과 정비사진, 정비 이력을 프로모터스 앱에서 확인하세요.'}],
    introSlides: [{key: 'qa-workshop', alt: '정비 작업 예시'}],
    products: [{id: 'qa-oil', name: '엔진오일 교환'}, {id: 'qa-brake', name: '브레이크 점검'}, {id: 'qa-inspection', name: '차량 점검'}], eventBanners: [],
  };
  const customerContext: CustomerContext = {existing: true, matchKind: '회원 정보 일치', limited: true,
    bookings: [bookings[2]], runs: [{id: 'qa-old-run', branch: '프로모터스 안산점', service: '브레이크 점검', status: '완료', bookingDate: qaDate(-20), bookingTime: '14:00', mileage: 56000}],
    audit: [{id: 'qa-log', at: new Date().toISOString(), action: '예약 확인', branch: '프로모터스 안산점', by: '담당 관리자', detail: '방문 일정 확인 (예시)'}],
    memos: [{id: 'qa-memo', title: '고객 상담', body: '소모품 점검 요청 (예시)', createdAt: new Date().toISOString()}],
    records: [{id: 'qa-record', date: qaDate(-20), branch: '프로모터스 안산점', service: '브레이크 점검', note: '완료된 정비 이력 예시'}]};
  const notificationState: NotificationState = {admin: false, preferences: {enabled: false, booking: true, repair: true, reminders: true, marketing: false}, maintenanceDate: null, items: [
    {id: 'qa-alert', category: 'booking', title: '새 예약 · 예시 고객 · BMW 520d', body: qaDate(1) + ' 10:00 · 프로모터스 안산점\n차량번호 비공개 · 엔진오일 교환', created_at: new Date().toISOString(), target: {kind: 'booking', id: 'qa-pending', branch: '프로모터스 안산점'}},
    {id: 'qa-repair-alert', category: 'repair', title: '정비사진이 도착했어요', body: '입고 점검 사진을 확인해 주세요. 예시 화면입니다.', created_at: new Date().toISOString(), target: {kind: 'repair', id: 'qa-run'}},
  ]};
  return {bookings, runs, content, customerContext, notificationState};
}
