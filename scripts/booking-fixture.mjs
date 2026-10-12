import { createBookingActions } from '/notifications/booking-actions.js';
const original = { id: 'synthetic-booking', branch: '프로모터스 새솔점', date: '2026.10.20', time: '10:00', name: '검증 고객', car: '테스트 차량', model: '검증 차종', services: ['엔진오일'], memo: '예약 내용을 확인해 주세요.', phone: '01000000000', status: '신규' };
let booking = structuredClone(original), fail = false, token = 'fixture-only', changed = 0;
async function rpc(name, { p_action, p_data }) {
  if (fail) throw new Error('검증용 저장 실패');
  if (p_action === 'pending') return { items: booking.status === '신규' ? [structuredClone(booking)] : [] };
  if (p_action === 'get') return { booking: structuredClone(booking) };
  const pending = booking.status === '신규';
  if (pending) booking = { ...booking, status: p_action === 'accept' ? '예약' : '취소', rejectionReason: p_data.reason, rejectedAt: p_action === 'reject' ? 'fixture' : null };
  return { changed: pending, booking: structuredClone(booking) };
}
const api = createBookingActions({ rpc, getToken: () => token, isAdmin: () => Boolean(token), onChanged: async () => { changed += 1; } });
api.listen(() => document.getElementById('pending').replaceChildren(api.render()));
document.getElementById('open').addEventListener('click', () => api.open(booking.id));
await api.start();
const sleep = () => new Promise(resolve => setTimeout(resolve, 80));
const click = text => [...document.querySelectorAll('.pm-booking-dialog button')].find(node => node.textContent === text)?.click();
document.getElementById('tests').addEventListener('click', async () => {
  const results = [], check = (value, name) => { if (!value) throw new Error(name); results.push('PASS ' + name); };
  try {
    await api.open(booking.id);
    check(document.querySelector('.pm-booking-call').getAttribute('href') === 'tel:01000000000', '전화 앱 연결');
    click('닫기'); await api.refresh();
    check(document.getElementById('pending').textContent.includes('1건'), '열고 닫아도 대기 유지');
    await api.open(booking.id); fail = true; click('예약 수락'); await sleep();
    check(booking.status === '신규' && document.querySelector('.pm-booking-feedback').textContent.includes('실패'), '저장 실패 시 대기 유지');
    fail = false; booking.status = '예약'; click('예약 수락'); await sleep();
    check(document.querySelector('.pm-booking-feedback').textContent.includes('이미 처리'), '다른 관리자 처리 결과 표시');
    click('닫기'); booking = structuredClone(original); await api.refresh(); await api.open(booking.id);
    click('거절'); const field = document.querySelector('.pm-booking-rejection textarea');
    check(field.required && !field.checkValidity(), '거절 사유 필수');
    field.value = '검증용 일정 마감'; document.querySelector('.pm-booking-rejection').requestSubmit(); await sleep();
    check(booking.status === '취소' && booking.rejectionReason === '검증용 일정 마감', '거절 확정 저장');
    check(document.getElementById('pending').textContent.includes('0건'), '처리 완료 시 대기 해제');
    click('닫기'); booking = structuredClone(original); await api.refresh(); await api.open(booking.id); click('예약 수락'); await sleep();
    check(booking.status === '예약', '예약 수락 저장');
    token = ''; api.reset(); check(!document.querySelector('.pm-booking-dialog') && !document.getElementById('pending').textContent, '로그아웃 개인정보 제거');
    token = 'fixture-only'; booking = structuredClone(original); await api.start();
    document.getElementById('result').textContent = results.join('\n');
  } catch (error) { document.getElementById('result').textContent = results.join('\n') + '\nFAIL ' + error.message; }
});
