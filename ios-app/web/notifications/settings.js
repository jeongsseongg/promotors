(() => {
  'use strict';
  const categories = {
    booking: ['예약 알림', '예약 접수, 확정, 변경과 취소'],
    repair: ['정비 진행 알림', '정비 사진과 진행 상황, 출고 안내'],
    reminders: ['예약·점검 리마인드', '예약 전날과 정기점검 날짜 안내'],
    marketing: ['혜택·이벤트', '선택 동의 · 언제든 끌 수 있어요']
  };
  function render(api) {
    const { element: el, button, state, perform, call, refresh, status } = api;
    const section = el('section', undefined, 'pm-notify-settings');
    section.append(el('h3', '필요한 소식만 받아보세요', 'pm-notify-settings-title'),
      el('p', '예약부터 정비 완료까지, 놓치지 않도록', 'pm-notify-muted'), api.deviceControls());
    const group = el('div', undefined, 'pm-notify-setting-group');
    group.append(el('h4', '받을 알림', 'pm-notify-group-label'));
    for (const [key, [title, description]] of Object.entries(categories)) {
      const row = el('div', undefined, 'pm-notify-setting-row');
      const text = el('div'); text.append(el('strong', title), el('p', description, 'pm-notify-row-description'));
      const toggle = button('', () => perform(async () => {
        const value = !state.preferences[key];
        await call('preferences', { [key]: value });
        state.preferences[key] = value;
        toggle.setAttribute('aria-checked', String(value));
        status(`${title}을 ${value ? '켰어요' : '껐어요'}.`);
      }), 'pm-notify-switch');
      toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', title);
      toggle.setAttribute('aria-checked', String(Boolean(state.preferences[key])));
      row.append(text, toggle); group.append(row);
    }
    section.append(group, sound(api), maintenance(api));
    section.append(button('테스트 알림 보내기', api.test, 'pm-notify-button pm-notify-text-button'));
    section.append(el('p', '소리와 진동은 휴대폰의 알림 설정을 따라요.', 'pm-notify-footnote'));
    return section;
  }
  function sound({ element: el, button, status }) {
    const row = el('div', undefined, 'pm-notify-setting-row pm-notify-setting-group');
    const text = el('div'); text.append(el('strong', '알림음'), el('p', '프로모터스 · 정밀 체크', 'pm-notify-row-description'));
    const audio = el('audio'); audio.src = 'notifications/02-precision-check.wav'; audio.preload = 'none'; audio.hidden = true;
    row.append(text, button('미리 듣기', () => {
      audio.currentTime = 0; audio.play().catch(() => status('소리를 재생하지 못했습니다.', true));
    }, 'pm-notify-button pm-notify-text-button'), audio);
    return row;
  }
  function maintenance(api) {
    const { element: el, button, state, perform, call, refresh, status } = api;
    const group = el('div', undefined, 'pm-notify-setting-group');
    group.append(el('h4', '정기점검', 'pm-notify-group-label'));
    const row = button('', async () => {
      const { pickDate } = await import('./date-picker.js?v=20261002');
      const date = await pickDate(state.maintenanceDate);
      if (date) perform(async () => {
        await call('maintenance', { date }); await refresh(); status('점검 알림 날짜를 저장했어요.');
      });
    }, 'pm-notify-date-row');
    const text = el('div'); text.append(el('strong', '다음 점검 알림 날짜'),
      el('span', state.maintenanceDate ? state.maintenanceDate.replaceAll('-', '.') : '날짜 선택', 'pm-notify-date-value'));
    const arrow = el('span', '›', 'pm-notify-chevron'); arrow.setAttribute('aria-hidden', 'true');
    row.append(text, arrow); group.append(row);
    if (state.maintenanceDate) group.append(button('점검 알림 예약 취소', () => perform(async () => {
      await call('maintenance', { date: null }); await refresh(); status('점검 알림 예약을 취소했어요.');
    }), 'pm-notify-button pm-notify-text-button'));
    return group;
  }
  window.PMNotificationSettings = Object.freeze({ render });
})();
