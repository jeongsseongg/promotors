/* Persistent in-app queue. Server-authorized bookings only; no dismiss/read removal. */
export function attachBookingDock(bookings) {
  let panel, expanded = false, state;
  const node = (tag, text, cls) => {
    const value = document.createElement(tag);
    if (text !== undefined) value.textContent = text;
    if (cls) value.className = cls;
    return value;
  };
  function startsAt(booking) {
    const day = String(booking.date || '').match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/);
    const time = String(booking.time || '').match(/^(\d{1,2}):(\d{2})/);
    if (!day || !time) return Infinity;
    return Date.parse(`${day[1]}-${day[2].padStart(2, '0')}-${day[3].padStart(2, '0')}T${time[1].padStart(2, '0')}:${time[2]}:00+09:00`);
  }
  function remaining(booking) {
    const minutes = Math.ceil((startsAt(booking) - Date.now()) / 60000);
    if (!Number.isFinite(minutes)) return '시간 확인 필요';
    if (minutes <= 0) return '예약 시간 지남';
    if (minutes < 60) return `${minutes}분 후`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ''} 후`;
    return `${Math.ceil(minutes / 1440)}일 후`;
  }
  function row(booking, pending) {
    const entry = node('button', undefined, 'pm-booking-dock-row');
    entry.type = 'button'; entry.dataset.bookingId = booking.id;
    entry.append(node('span', `${pending ? '수락 대기' : '방문 예정'} · ${remaining(booking)}`, 'pm-booking-dock-state'),
      node('strong', `${booking.date} · ${booking.time}`),
      node('span', `${booking.branch} · ${booking.name || '고객'}`, 'pm-booking-muted'),
      node('span', '예약 확인 ›', 'pm-booking-link'));
    entry.addEventListener('click', () => bookings.open(booking.id).catch(error => {
      panel.querySelector('[role="status"]').textContent = error.message || '예약을 다시 확인해 주세요.';
    }));
    return entry;
  }
  function paint() {
    state = bookings.snapshot();
    if (!state.active) {
      panel?.remove(); panel = undefined; expanded = false;
      document.body.classList.remove('pm-booking-dock-active'); return;
    }
    if (!panel) {
      panel = node('aside', undefined, 'pm-booking-dock');
      panel.setAttribute('aria-label', '상시 예약 알림'); document.body.append(panel);
      document.body.classList.add('pm-booking-dock-active');
    }
    const pending = [...state.items].sort((a, b) => startsAt(a) - startsAt(b));
    const upcoming = [...state.upcoming].sort((a, b) => startsAt(a) - startsAt(b));
    panel.replaceChildren(); panel.classList.toggle('pm-booking-dock-expanded', expanded);
    const header = node('header', undefined, 'pm-booking-dock-header');
    header.append(node('strong', state.loaded ? `처리 대기 ${pending.length}건 · 방문 예정 ${upcoming.length}건` : '예약 일정을 확인하고 있어요'));
    const toggle = node('button', expanded ? '간단히' : '전체 일정', 'pm-booking-button'); toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.addEventListener('click', () => { expanded = !expanded; paint(); }); header.append(toggle);
    const list = node('div', undefined, 'pm-booking-dock-list');
    const entries = [...pending.map(b => ({ b, pending: true })), ...upcoming.map(b => ({ b, pending: false }))]
      .sort((a, b) => startsAt(a.b) - startsAt(b.b));
    const summary = pending.length && upcoming.length
      ? [{ b: pending[0], pending: true }, { b: upcoming[0], pending: false }] : entries.slice(0, 2);
    for (const item of expanded ? entries : summary) list.append(row(item.b, item.pending));
    if (!entries.length && state.loaded) list.append(node('p', '현재 처리 대기·방문 예정 예약이 없어요.', 'pm-booking-muted'));
    const message = node('p', state.error || (pending.length ? '수락·거절 전까지 계속 표시됩니다.' : '방문 일정은 시간순으로 표시됩니다.'), 'pm-booking-dock-message');
    message.setAttribute('role', 'status'); panel.append(header, list, message);
  }
  bookings.listen(paint);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && bookings.snapshot().active) bookings.refresh().catch(() => {});
  });
  paint();
}
