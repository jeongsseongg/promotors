/* Server-authorized schedules occupy their own page, never cover another calendar. */
export function createBookingSchedule(bookings) {
  let page, body, entry, filter = 'all', branch = '', selectedDate = '', focusedId = '', opening, signature = '', editingId = '', processing = false, notice = '';
  const node = (tag, text, cls) => {
    const value = document.createElement(tag);
    if (text !== undefined) value.textContent = text;
    if (cls) value.className = cls;
    return value;
  };
  function button(text, action, cls = 'pm-booking-button') {
    const value = node('button', text, cls);
    value.type = 'button'; value.addEventListener('click', action); return value;
  }
  function close() {
    page?.close(); page?.remove(); page = undefined; body = undefined;
    focusedId = ''; filter = 'all'; branch = ''; selectedDate = ''; editingId = ''; notice = '';
  }
  function entries() {
    const state = bookings.snapshot();
    return [...state.items.map(booking => ({ booking, pending: true })),
      ...state.upcoming.map(booking => ({ booking, pending: false }))]
      .sort((a, b) => `${a.booking.date} ${a.booking.time}`.localeCompare(`${b.booking.date} ${b.booking.time}`));
  }
  function mountEntry() {
    const state = bookings.snapshot(), host = document.querySelector('#view-adm-book');
    if (!state.active) { entry?.remove(); entry = undefined; close(); return; }
    if (!host) return;
    if (!entry) {
      entry = button('', () => open().catch(showError), 'pm-booking-button pm-booking-schedule-entry');
      host.querySelector('#adm-book-body')?.before(entry);
    }
    entry.textContent = `예약 일정 보기 · 수락 대기 ${state.items.length}건 · 방문 예정 ${state.upcoming.length}건`;
  }
  function row(item) {
    const { booking, pending } = item;
    const value = node('article', undefined, 'pm-booking-schedule-row');
    value.dataset.bookingId = booking.id;
    value.classList.toggle('pm-booking-schedule-focused', booking.id === focusedId);
    const link = button('', () => bookings.open(booking.id).catch(showError), 'pm-booking-card-open');
    link.setAttribute('aria-label', [booking.name || '고객', booking.model, booking.car, '예약 상세정보'].filter(Boolean).join(' · '));
    const top = node('div', undefined, 'pm-booking-card-top');
    top.append(node('strong', booking.time, 'pm-booking-schedule-time'),
      node('span', pending ? '수락 대기' : '방문 예정', 'pm-booking-status'));
    link.append(top, node('strong', booking.name || '고객', 'pm-booking-card-customer'),
      node('strong', booking.model || '차량명 미등록', 'pm-booking-card-model'),
      node('span', booking.car || '차량번호 미등록', 'pm-booking-card-number'),
      node('span', booking.branch, 'pm-booking-muted'),
      node('span', (booking.services || []).join(' · ') || '정비 항목 미선택', 'pm-booking-card-services'),
      node('span', '예약 전체정보 · 고객 기록 보기 ›', 'pm-booking-link'));
    value.append(link);
    if (pending) {
      const actions = node('div', undefined, 'pm-booking-card-actions');
      actions.append(button('예약 거절', () => rejection(value, booking.id)),
        button('예약 승인', () => process(booking.id, 'accept'), 'pm-booking-button pm-booking-primary'));
      value.append(actions);
    }
    return value;
  }
  async function process(id, action, reason = '') {
    if (processing) return;
    processing = true;
    for (const control of body.querySelectorAll('button, textarea')) control.disabled = true;
    try { notice = (await bookings.perform(id, action, reason)).message; editingId = ''; }
    catch (error) { notice = error.message || '예약 처리를 다시 시도해 주세요.'; }
    finally {
      processing = false;
      for (const control of body?.querySelectorAll('button, textarea') || []) control.disabled = false;
      paint();
    }
  }
  function rejection(card, id) {
    if (processing) return;
    if (editingId && editingId !== id) { editingId = ''; paint(); card = body.querySelector('[data-booking-id="' + id + '"]'); }
    if (card.querySelector('form')) return;
    editingId = id;
    const form = node('form', undefined, 'pm-booking-rejection pm-booking-card-rejection');
    const label = node('label', '거절 사유'), reason = node('textarea');
    reason.required = true; reason.rows = 2; reason.maxLength = 200;
    reason.placeholder = '고객에게 안내할 거절 사유를 입력해 주세요.'; label.append(reason);
    const actions = node('div', undefined, 'pm-booking-card-actions');
    const submit = node('button', '거절 확정', 'pm-booking-button pm-booking-primary'); submit.type = 'submit';
    actions.append(button('돌아가기', () => { editingId = ''; paint(); }), submit);
    form.append(label, actions);
    form.addEventListener('submit', event => { event.preventDefault(); if (reason.value.trim()) process(id, 'reject', reason.value.trim()); });
    card.querySelector('.pm-booking-card-actions').remove(); card.append(form); reason.focus();
  }
  function showError(error) {
    notice = error.message || '예약을 다시 확인해 주세요.';
    const message = body?.querySelector('[role="status"]');
    if (message) message.textContent = error.message || '예약을 다시 확인해 주세요.';
  }
  function controls(all) {
    const bar = node('div', undefined, 'pm-booking-schedule-controls');
    const tabs = node('nav', undefined, 'pm-booking-schedule-tabs');
    tabs.setAttribute('aria-label', '예약 상태');
    for (const [key, text] of [['all', '전체'], ['pending', '수락 대기'], ['upcoming', '방문 예정']]) {
      const tab = button(text, () => { filter = key; paint(); });
      tab.setAttribute('aria-pressed', String(filter === key)); tabs.append(tab);
    }
    const dateLabel = node('label', '예약 날짜'), date = node('input');
    date.type = 'date'; date.value = selectedDate;
    date.addEventListener('change', () => { selectedDate = date.value; paint(); }); dateLabel.append(date);
    bar.append(tabs, dateLabel, button('전체 날짜', () => { selectedDate = ''; paint(); }));
    const branches = [...new Set(all.map(item => item.booking.branch))];
    if (branches.length > 1) {
      const label = node('label', '지점'), select = node('select');
      for (const value of ['', ...branches]) {
        const option = node('option', value || '전체 지점'); option.value = value; select.append(option);
      }
      select.value = branch; select.addEventListener('change', () => { branch = select.value; paint(); });
      label.append(select); bar.append(label);
    }
    return bar;
  }
  function paint() {
    if (!page || processing) return;
    const state = bookings.snapshot(), all = entries();
    if (editingId && all.some(item => item.booking.id === editingId && item.pending)) {
      const message = body.querySelector('[role="status"]');
      if (message) message.textContent = notice || state.error || '';
      return;
    }
    editingId = '';
    body.replaceChildren(node('h2', '예약 일정'),
      node('p', `수락 대기 ${state.items.length}건 · 방문 예정 ${state.upcoming.length}건`, 'pm-booking-muted'), controls(all));
    const status = node('p', notice || state.error || (!state.loaded ? '예약 일정을 확인하고 있어요.' : ''), 'pm-booking-feedback');
    status.setAttribute('role', 'status'); body.append(status);
    const visible = all.filter(item => (!branch || item.booking.branch === branch)
      && (!selectedDate || item.booking.date.replaceAll('.', '-') === selectedDate)
      && (filter === 'all' || item.pending === (filter === 'pending')));
    let day, group;
    for (const item of visible) {
      if (day !== item.booking.date) {
        day = item.booking.date; group = node('section', undefined, 'pm-booking-schedule-day');
        group.append(node('h3', day)); body.append(group);
      }
      group.append(row(item));
    }
    if (!visible.length && state.loaded && !state.error) body.append(node('p', '표시할 예약 일정이 없습니다.', 'pm-booking-empty'));
  }
  async function open(id = '') {
    if (opening) return opening;
    if (!bookings.snapshot().active) throw new Error('관리자 로그인 후 이용해 주세요.');
    opening = (async () => {
      await bookings.refresh().catch(() => {});
      if (!bookings.snapshot().active) return;
      focusedId = String(id);
      if (!page) {
        page = node('dialog', undefined, 'pm-booking-dialog pm-booking-schedule-page');
        page.setAttribute('aria-label', '프로모터스 예약 일정');
        const header = node('header', undefined, 'pm-booking-header');
        header.append(node('strong', '프로모터스'), button('닫기', close, 'pm-booking-button pm-booking-close'));
        body = node('div', undefined, 'pm-booking-body'); page.append(header, body);
        page.addEventListener('cancel', close); document.body.append(page); page.showModal();
      }
      paint();
      const focused = [...body.querySelectorAll('[data-booking-id]')].find(value => value.dataset.bookingId === focusedId);
      focused?.scrollIntoView({ block: 'center' });
    })().finally(() => { opening = undefined; });
    return opening;
  }
  bookings.listen(() => {
    const next = JSON.stringify(bookings.snapshot());
    if (signature === next) return;
    signature = next; mountEntry(); paint();
  });
  mountEntry();
  return { open, close };
}
