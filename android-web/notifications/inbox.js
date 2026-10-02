/* Category opt-out uses the same account preferences as the delivery worker. */
(() => {
  'use strict';
  function render(api) {
    const { items, preferences, labels, element, button, perform, call, refresh, status, close, openTarget } = api;
    const section = element('section', undefined, 'pm-notify-section');
    section.append(element('h3', '최근 알림'), button('모두 읽음', () => perform(async () => {
      await call('read', { all: true }); await refresh(); status('모두 읽음으로 표시했습니다.');
    })));
    const list = element('ul', undefined, 'pm-notify-list');
    if (!Array.isArray(items) || !items.length) section.append(element('p', '아직 도착한 알림이 없습니다.', 'pm-notify-muted'));
    for (const item of Array.isArray(items) ? items : []) {
      const row = element('li', undefined, item.read_at ? 'pm-notify-item' : 'pm-notify-item pm-notify-unread');
      row.id = `pm-notice-${item.id}`;
      const label = labels[item.category];
      row.append(element('span', label || '서비스 안내', 'pm-notify-category'),
        element('strong', item.title || '프로모터스 알림'), element('p', item.body || ''));
      const time = new Date(item.created_at);
      row.append(element('small', `${item.read_at ? '읽음' : '읽지 않음'} · ${Number.isNaN(time.getTime()) ? '' : time.toLocaleString('ko-KR')}`));
      const actions = element('div', undefined, 'pm-notify-item-actions');
      actions.append(button(item.target ? '내용 확인' : '읽음으로 표시', () => perform(async () => {
        await call('read', { id: item.id });
        if (item.target && openTarget) { close(); await openTarget({ ...item.target, notificationId: item.id }); }
        else await refresh();
      })));
      if (label) {
        const enabled = Boolean(preferences[item.category]);
        actions.append(button(enabled ? '이 종류 알림 끄기' : '이 종류 알림 켜기', () => perform(async () => {
          if (!enabled && item.category === 'marketing' && !window.confirm('이벤트·혜택 푸시 알림 수신에 동의할까요? 언제든 설정에서 끌 수 있습니다.')) return;
          await call('preferences', { [item.category]: !enabled });
          await refresh(); status(`${label} 알림 수신을 ${enabled ? '껐습니다' : '켰습니다'}.`);
        })));
      }
      row.append(actions); list.append(row);
    }
    section.append(list); return section;
  }
  window.PMNotificationInbox = Object.freeze({ render });
})();
