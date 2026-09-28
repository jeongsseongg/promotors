(function (global) {
  'use strict';
  function element(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function render() {
    document.getElementById('pm-deidentified-repair-history')?.remove();
    if (!isMainAdmin()) return;
    const host = document.getElementById('adm-work-history');
    if (!host) return;
    const records = getServiceRuns().filter(run => run.deidentified === true);
    const section = element('section', undefined, 'work-history');
    section.id = 'pm-deidentified-repair-history';
    section.append(element('h3', '개인정보가 삭제된 정비 이력'));
    if (!records.length) section.append(element('p', '보관된 정비 이력이 없습니다.', 'hint'));
    const list = element('div', undefined, 'work-history-list');
    for (const run of records) {
      const row = element('article', undefined, 'work-history-item');
      const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(run.completedMonth || '')
        ? run.completedMonth.replace('-', '년 ') + '월' : '완료월 미확인';
      row.append(element('strong', run.service || '정비'), element('p', month));
      const names = (Array.isArray(run.steps) ? run.steps : [])
        .map(step => typeof step === 'string' ? step : step?.name).filter(name => typeof name === 'string');
      if (names.length) row.append(element('p', names.join(' · ')));
      list.append(row);
    }
    section.append(list);
    host.insertAdjacentElement('afterend', section);
  }
  global.PMRepairHistory = Object.freeze({ render });
})(window);
