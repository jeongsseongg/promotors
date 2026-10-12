/* Pending work is derived from booking status, never notification read state. */
export function createBookingActions({ rpc, getToken, isAdmin, onChanged, canView = () => true }) {
  let loadError = '', items = [], upcoming = [], loaded = false, detail, selected, feedback, busy = false, timer, generation = 0;
  const listeners = new Set();
  let suspended = false;
  function el(tag, text, cls) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function button(text, action, cls = '') {
    const node = el('button', text, `pm-booking-button ${cls}`);
    node.type = 'button'; node.addEventListener('click', action); return node;
  }
  async function request(action, data = {}) {
    const token = getToken(), epoch = generation;
    if (!token || !isAdmin()) throw new Error('관리자 로그인 후 이용해 주세요.');
    let result;
    try { result = await rpc('pm_admin_booking_actions', { p_token: token, p_action: action, p_data: data }); }
    catch (error) {
      if (/AUTH_REQUIRED|ADMIN_REQUIRED/.test(error.message)) { reset(); throw new Error('관리자 로그인을 다시 확인해 주세요.'); }
      if (/BOOKING_UNAVAILABLE/.test(error.message)) throw new Error('예약이 없거나 이 지점의 처리 권한이 없습니다.');
      throw error;
    }
    if (epoch !== generation || token !== getToken()) throw new Error('로그인 상태가 변경되었습니다.');
    if (result?.ok === false) throw new Error(result.message || '예약 처리를 완료하지 못했습니다.');
    return result;
  }
  async function refresh() {
    if (!isAdmin() || !getToken()) return reset();
    suspended = false;
    let result;
    try { result = await request('pending'); loadError = ''; }
    catch (error) { loadError = '처리 대기 예약을 불러오지 못했어요. 다시 열어 주세요.'; for (const notify of listeners) notify(); throw error; }
    items = (result.items || []).filter(row => canView(row.branch));
    upcoming = (result.upcoming || []).filter(row => canView(row.branch));
    loaded = true;
    for (const notify of listeners) notify();
    if (selected && detail && !busy) {
      const current = await request('get', { id: selected.id });
      if (current.booking.status !== selected.status) { selected = current.booking; paint(); }
    }
  }
  function pending() { return ['신규', '승인대기'].includes(selected?.status); }
  function close(force = false) { if (busy && force !== true) return; detail?.close(); detail?.remove(); detail = undefined; selected = undefined; }
  function reset() {
    suspended = true;
    generation += 1; clearInterval(timer); items = []; upcoming = []; loaded = false; loadError = ''; close(true);
    for (const notify of listeners) notify();
  }
  async function start() {
    clearInterval(timer);
    if (!isAdmin() || !getToken()) return reset();
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh().catch(() => {
        if (feedback) feedback.textContent = '최신 상태를 확인하지 못했어요. 처리 전에 다시 확인합니다.';
      });
    }, 12000);
    await refresh();
  }
  function render() {
    const section = el('section', undefined, 'pm-booking-pending');
    if (!isAdmin()) return section;
    section.append(el('h3', `처리 대기 예약 ${items.length}건`),
      el('p', '읽어도 사라지지 않아요. 수락하거나 거절하면 정리됩니다.', 'pm-booking-muted'));
    if (loadError) section.append(el('p', loadError, 'pm-booking-feedback'));
    if (!items.length && !loadError) section.append(el('p', '처리할 예약이 없어요.', 'pm-booking-empty'));
    for (const booking of items) {
      const row = button('', () => open(booking.id).catch(showError), 'pm-booking-pending-row');
      row.append(el('span', booking.branch, 'pm-booking-muted'),
        el('strong', `${booking.date} · ${booking.time}`),
        el('span', `${booking.name || '고객'} · ${booking.car || '차량 정보 없음'}`),
        el('span', '예약 확인하기 ›', 'pm-booking-link'));
      section.append(row);
    }
    return section;
  }
  function showError(error) {
    if (detail && feedback) feedback.textContent = error.message || '다시 시도해 주세요.';
    else { loadError = error.message || '예약을 열 수 없습니다.'; for (const notify of listeners) notify(); }
  }
  async function open(id) {
    const result = await request('get', { id });
    if (!canView(result.booking.branch)) throw new Error('이 지점의 예약을 볼 수 없습니다.');
    close(true); selected = result.booking;
    detail = el('dialog', undefined, 'pm-booking-dialog');
    detail.setAttribute('aria-labelledby', 'pm-booking-title');
    detail.addEventListener('cancel', event => { if (busy) event.preventDefault(); else close(); });
    document.body.append(detail); paint(); detail.showModal();
  }
  function paint() {
    detail.replaceChildren();
    const header = el('header', undefined, 'pm-booking-header');
    header.append(el('strong', '프로모터스'), button('닫기', close, 'pm-booking-close'));
    const body = el('div', undefined, 'pm-booking-body');
    body.append(el('span', pending() ? '처리 대기' : selected.rejectedAt ? '거절 완료' : selected.status, 'pm-booking-status'));
    const title = el('h2', pending() ? '새 예약이 들어왔어요' : '처리된 예약이에요'); title.id = 'pm-booking-title';
    body.append(title, el('p', pending() ? '예약 내용을 확인하고 처리해 주세요.' : '최신 처리 결과를 확인해 주세요.', 'pm-booking-muted'));
    const schedule = el('section', undefined, 'pm-booking-schedule');
    schedule.append(el('strong', selected.branch), el('h3', `${selected.date} · ${selected.time}`)); body.append(schedule);
    const facts = el('dl', undefined, 'pm-booking-facts');
    for (const [label, value] of [['고객', selected.name], ['차량', [selected.car, selected.model].filter(Boolean).join(' · ')],
      ['정비 항목', (selected.services || []).join(' · ')], ['요청사항', selected.memo], ['거절 사유', selected.rejectionReason]]) {
      if (!value) continue;
      const row = el('div'); row.append(el('dt', label), el('dd', value)); facts.append(row);
    }
    body.append(facts);
    const number = String(selected.phone || '').replace(/[^0-9+]/g, '');
    if (/^\+?[0-9]{8,15}$/.test(number)) {
      const call = el('a', '고객에게 전화', 'pm-booking-button pm-booking-call'); call.href = `tel:${number}`; body.append(call);
    } else body.append(el('p', '연결할 고객 전화번호가 없습니다.', 'pm-booking-muted'));
    feedback = el('p', '', 'pm-booking-feedback'); feedback.setAttribute('role', 'status');
    body.append(feedback); detail.append(header, body);
    if (pending()) {
      const actions = el('footer', undefined, 'pm-booking-actions');
      actions.append(button('거절', rejection), button('예약 수락', () => decide('accept'), 'pm-booking-primary'));
      detail.append(actions);
    }
  }
  function rejection() {
    if (busy) return;
    const form = el('form', undefined, 'pm-booking-rejection');
    const label = el('label', '거절 사유');
    const reason = el('textarea'); reason.required = true; reason.maxLength = 200; reason.rows = 3;
    reason.placeholder = '예약을 받을 수 없는 이유를 입력해 주세요.'; label.append(reason);
    const actions = el('div', undefined, 'pm-booking-actions');
    actions.append(button('돌아가기', paint));
    const submit = el('button', '거절 확정', 'pm-booking-button pm-booking-primary'); submit.type = 'submit'; actions.append(submit);
    form.append(label, el('p', '확정하면 이 예약은 취소 처리됩니다.', 'pm-booking-muted'), actions);
    form.addEventListener('submit', event => { event.preventDefault(); if (reason.value.trim()) decide('reject', reason.value.trim()); });
    detail.querySelector('footer')?.remove(); detail.querySelector('.pm-booking-body').append(form); reason.focus();
  }
  async function decide(action, reason = '') {
    if (busy) return;
    busy = true; const epoch = generation;
    detail.setAttribute('aria-busy', 'true');
    for (const node of detail.querySelectorAll('button, textarea')) node.disabled = true;
    try {
      const result = await request(action, { id: selected.id, reason });
      selected = result.booking; paint();
      for (const node of detail.querySelectorAll('button')) node.disabled = true;
      feedback.textContent = result.changed ? (action === 'accept' ? '예약을 수락했어요.' : '예약을 거절했어요.') : '이미 처리된 예약이에요. 최신 결과를 확인해 주세요.';
      await onChanged?.(result).catch(() => { feedback.textContent += ' 화면을 다시 열어 최신 상태를 확인해 주세요.'; });
      await refresh().catch(() => {});
    } catch (error) { if (epoch === generation) showError(error); }
    finally {
      busy = false; detail?.removeAttribute('aria-busy');
      for (const node of detail?.querySelectorAll('button, textarea') || []) node.disabled = false;
    }
  }
  return { open, render, start, refresh, reset,
    snapshot: () => ({ items, upcoming, loaded, error: loadError, active: Boolean(!suspended && isAdmin() && getToken()) }),
    listen: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
}
