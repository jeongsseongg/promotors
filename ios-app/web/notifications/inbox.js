/* Reading notifications does not change receiving preferences. */
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
      row.append(actions); list.append(row);
    }
    section.append(list); return section;
  }
  window.PMNotificationInbox = Object.freeze({ render });
})();
