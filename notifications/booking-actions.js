/* Pending work is derived from booking status, never notification read state. */
export function createBookingActions({ rpc, getToken, isAdmin, onChanged, canView = () => true }) {
  let loadError = '', actionMessage = '', items = [], upcoming = [], loaded = false, detail, selected, customerContext, feedback, busy = false, timer, generation = 0;
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
    catch (error) { actionMessage = ''; loadError = '처리 대기 예약을 불러오지 못했어요. 다시 열어 주세요.'; for (const notify of listeners) notify(); throw error; }
    items = (result.items || []).filter(row => canView(row.branch));
    upcoming = (result.upcoming || []).filter(row => canView(row.branch));
    loaded = true;
    for (const notify of listeners) notify();
    if (selected && detail && !busy) {
      const current = await request('get', { id: selected.id });
      if (current.booking.status !== selected.status) { selected = current.booking; customerContext = current.customerContext; paint(); }
    }
  }
  function pending() { return ['신규', '승인대기'].includes(selected?.status); }
  function close(force = false) { if (busy && force !== true) return; detail?.close(); detail?.remove(); detail = undefined; selected = undefined; customerContext = undefined; }
  function reset() {
    suspended = true;
    generation += 1; clearInterval(timer); items = []; upcoming = []; loaded = false; loadError = ''; actionMessage = ''; close(true);
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
    section.append(el('h3', '처리 대기 예약 ' + items.length + '건'),
      el('p', '예약정보를 확인하고 바로 승인하거나 거절하세요.', 'pm-booking-muted'));
    const status = el('p', actionMessage || loadError, 'pm-booking-feedback');
    status.setAttribute('role', 'status'); section.append(status);
    if (!items.length && !loadError) section.append(el('p', '처리할 예약이 없어요.', 'pm-booking-empty'));
    for (const booking of items) section.append(pendingCard(booking));
    return section;
  }
  function pendingCard(booking) {
    const row = el('article', undefined, 'pm-booking-schedule-row pm-booking-pending-card');
    row.dataset.bookingId = booking.id;
    const link = button('', () => open(booking.id).catch(showError), 'pm-booking-card-open');
    link.setAttribute('aria-label', [booking.name || '고객', booking.model, booking.car, '예약 상세정보'].filter(Boolean).join(' · '));
    const top = el('div', undefined, 'pm-booking-card-top');
    top.append(el('strong', booking.time, 'pm-booking-schedule-time'), el('span', '승인 대기', 'pm-booking-status'));
    link.append(top, el('span', booking.date, 'pm-booking-muted'),
      el('strong', booking.name || '고객', 'pm-booking-card-customer'),
      el('strong', booking.model || '차량명 미등록', 'pm-booking-card-model'),
      el('span', booking.car || '차량번호 미등록', 'pm-booking-card-number'),
      el('span', booking.branch, 'pm-booking-muted'),
      el('span', (booking.services || []).join(' · ') || '정비 항목 미선택', 'pm-booking-card-services'),
      el('span', '예약 전체정보 · 고객 기록 보기 ›', 'pm-booking-link'));
    const actions = el('div', undefined, 'pm-booking-card-actions');
    actions.append(button('예약 거절', () => open(booking.id, { action: 'reject' }).catch(showError)),
      button('예약 승인', () => approveFromList(booking.id), 'pm-booking-primary'));
    row.append(link, actions);
    for (const control of row.querySelectorAll('button')) control.disabled = busy;
    return row;
  }
  async function approveFromList(id) {
    if (busy) return;
    actionMessage = '';
    try { actionMessage = (await perform(id, 'accept')).message; }
    catch (error) { actionMessage = error.message || '예약 승인을 다시 시도해 주세요.'; }
    finally { for (const notify of listeners) notify(); }
  }
  function showError(error) {
    if (detail && feedback) feedback.textContent = error.message || '다시 시도해 주세요.';
    else { actionMessage = ''; loadError = error.message || '예약을 열 수 없습니다.'; for (const notify of listeners) notify(); }
  }
  async function open(id, options = {}) {
    const result = await request('get', { id });
    if (!canView(result.booking.branch)) throw new Error('이 지점의 예약을 볼 수 없습니다.');
    if (busy) return; close(true); selected = result.booking; customerContext = result.customerContext;
    detail = el('dialog', undefined, 'pm-booking-dialog');
    detail.setAttribute('aria-labelledby', 'pm-booking-title');
    detail.addEventListener('cancel', event => { if (busy) event.preventDefault(); else close(); });
    document.body.append(detail); paint(); detail.showModal();
    if (pending() && options.action === 'accept') await decide('accept');
    else if (pending() && options.action === 'reject') rejection();
  }
  function historyDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function historyList(host, title, rows, describe) {
    const section = el('section', undefined, 'pm-booking-customer-history');
    section.append(el('h3', title));
    if (!rows?.length) section.append(el('p', '확인할 수 있는 기록이 없습니다.', 'pm-booking-muted'));
    else {
      const list = el('ul', undefined, 'pm-booking-history-list');
      for (const item of rows) {
        const row = el('li', undefined, 'pm-booking-history-item');
        for (const [index, text] of describe(item).entries()) {
          if (text) row.append(el(index === 0 ? 'strong' : 'p', text));
        }
        list.append(row);
      }
      section.append(list);
    }
    host.append(section);
  }
  function appendCustomerHistory(body) {
    if (!customerContext) {
      body.append(el('p', '고객 기록을 확인하지 못했습니다. 화면을 다시 열어 주세요.', 'pm-booking-muted')); return;
    }
    const intro = el('section', undefined, 'pm-booking-customer-history');
    intro.append(el('h3', customerContext.existing ? '기존 고객 기록' : '고객 기록'));
    intro.append(el('p', customerContext.existing ? '이 고객의 이전 예약과 정비 기록을 함께 확인하세요.' : customerContext.matchKind === '연결 확인 필요' ? '고객 정보 연결 확인이 필요합니다.' : '연결된 이전 기록이 없습니다.', 'pm-booking-muted'));
    if (customerContext.matchKind) intro.append(el('p', customerContext.matchKind, 'pm-booking-muted'));
    if (customerContext.limited) intro.append(el('p', '소유자와 접근 권한이 확인된 기록만 표시합니다.', 'pm-booking-muted'));
    body.append(intro);
    if (!customerContext.existing) return;
    historyList(body, '이전 예약', customerContext.bookings, item => [
      [item.date, item.time, item.status].filter(Boolean).join(' · '),
      [item.branch, item.model, item.car].filter(Boolean).join(' · '),
      (item.services || []).join(' · '), item.memo]);
    historyList(body, '정비 진행 기록', customerContext.runs, item => [
      [item.bookingDate, item.bookingTime, item.status].filter(Boolean).join(' · '),
      [item.branch, item.service].filter(Boolean).join(' · '),
      item.mileage ? '입고 주행거리 ' + Number(item.mileage).toLocaleString() + ' km' : '', item.reason]);
    historyList(body, '고객 처리 로그', customerContext.audit, item => [
      [historyDate(item.at), item.action].filter(Boolean).join(' · '),
      [item.branch, item.step, item.by].filter(Boolean).join(' · '), item.detail, item.memo]);
    historyList(body, '고객 메모', customerContext.memos, item => [
      [historyDate(item.createdAt), item.title].filter(Boolean).join(' · '), item.body]);
    historyList(body, '완료된 정비 이력', customerContext.records, item => [
      [item.date || item.completedAt, item.branch].filter(Boolean).join(' · '),
      item.service || (item.services || []).join(' · '), item.note]);
  }
  function paint() {
    detail.replaceChildren();
    const header = el('header', undefined, 'pm-booking-header');
    header.append(el('strong', '프로모터스'), button('닫기', close, 'pm-booking-close'));
    const body = el('div', undefined, 'pm-booking-body');
    body.append(el('span', pending() ? '처리 대기' : selected.rejectedAt ? '거절 완료' : selected.status, 'pm-booking-status'));
    const title = el('h2', pending() ? '새 예약이 들어왔어요' : '예약 상세정보'); title.id = 'pm-booking-title';
    body.append(title, el('p', pending() ? '예약 내용을 확인하고 처리해 주세요.' : '최신 처리 결과를 확인해 주세요.', 'pm-booking-muted'));
    const schedule = el('section', undefined, 'pm-booking-schedule');
    schedule.append(el('strong', selected.branch), el('h3', `${selected.date} · ${selected.time}`)); body.append(schedule);
    const facts = el('dl', undefined, 'pm-booking-facts');
    for (const [label, value] of [['예약자', selected.name], ['차량명', selected.model], ['차량번호', selected.car], ['연락처', selected.phone],
      ['접수 구분', selected.guest ? '비회원 예약' : selected.memberId ? '회원 예약' : '관리자 등록'], ['주행거리', selected.mileage ? `${Number(selected.mileage).toLocaleString()} km` : ''],
      ['정비 항목', (selected.services || []).join(' · ')], ['요청사항', selected.memo],
      ['신청 일시', historyDate(selected.createdAt)],
      ['사용 쿠폰', selected.couponName], ['거절 사유', selected.rejectionReason]]) {
      if (!value) continue;
      const row = el('div'); row.append(el('dt', label), el('dd', value)); facts.append(row);
    }
    body.append(facts); appendCustomerHistory(body);
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
  async function perform(id, action, reason = '') {
    if (busy) throw new Error('예약 처리 중입니다. 잠시 기다려 주세요.');
    if (!['accept', 'reject'].includes(action)) throw new Error('예약 처리 방법을 확인해 주세요.');
    if (action === 'reject' && !reason.trim()) throw new Error('거절 사유를 입력해 주세요.');
    busy = true;
    for (const notify of listeners) notify();
    try {
      const result = await request(action, { id, reason });
      items = items.filter(item => item.id !== id); upcoming = upcoming.filter(item => item.id !== id);
      if (['신규', '승인대기'].includes(result.booking.status)) items.push(result.booking);
      else if (result.booking.status === '예약') upcoming.push(result.booking);
      for (const notify of listeners) notify();
      await onChanged?.(result).catch(() => {});
      await refresh().catch(() => {});
      return { ...result, message: result.changed
        ? (action === 'accept' ? '예약을 수락했어요.' : '예약을 거절했어요.')
        : '이미 처리된 예약이에요. 최신 결과를 확인해 주세요.' };
    } finally { busy = false; for (const notify of listeners) notify(); }
  }
  async function decide(action, reason = '') {
    if (busy || !selected) return;
    const epoch = generation, id = selected.id;
    detail.setAttribute('aria-busy', 'true');
    for (const node of detail.querySelectorAll('button, textarea')) node.disabled = true;
    try {
      const result = await perform(id, action, reason);
      if (epoch !== generation || !detail || selected?.id !== id) return;
      selected = result.booking; paint(); feedback.textContent = result.message;
    } catch (error) { if (epoch === generation) showError(error); }
    finally {
      detail?.removeAttribute('aria-busy');
      for (const node of detail?.querySelectorAll('button, textarea') || []) node.disabled = false;
    }
  }
  return { open, perform, render, start, refresh, reset,
    snapshot: () => ({ items, upcoming, loaded, error: loadError, active: Boolean(!suspended && isAdmin() && getToken()) }),
    listen: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
}
