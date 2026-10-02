const iso = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
export function pickDate(value) {
  return new Promise(resolve => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const limit = new Date(today); limit.setDate(limit.getDate() + 1095);
    const initial = value ? new Date(`${value}T00:00:00`) : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const dialog = document.createElement('dialog'); dialog.className = 'pm-notify-date-sheet';
    dialog.setAttribute('aria-labelledby', 'pm-date-title');
    const title = document.createElement('h2'); title.id = 'pm-date-title'; title.textContent = '점검 날짜를 선택하세요';
    const description = document.createElement('p'); description.textContent = '연·월·일을 고르거나 숫자를 직접 입력해요.';
    const form = document.createElement('form');
    const wheels = document.createElement('div'); wheels.className = 'pm-notify-date-columns';
    const inputs = document.createElement('div'); inputs.className = 'pm-notify-date-columns pm-notify-date-inputs';
    const { fields, updateDays } = buildFields(today, limit, initial, wheels, inputs);
    updateDays(0);
    const error = document.createElement('p'); error.className = 'pm-notify-error'; error.setAttribute('role', 'status');
    const actions = document.createElement('div'); actions.className = 'pm-notify-date-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'pm-notify-button'; cancel.textContent = '취소';
    const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'pm-notify-button pm-notify-primary'; submit.textContent = '선택 완료';
    function finish(result) { dialog.close(); dialog.remove(); resolve(result); }
    cancel.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const [year, month, day] = fields.map(field => Number(field.input.value));
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date <= today || date > limit) {
        error.textContent = `내일부터 ${iso(limit).replaceAll('-', '.')}까지 선택할 수 있어요.`; return;
      }
      finish(iso(date));
    });
    actions.append(cancel, submit); form.append(wheels, inputs, error, actions);
    dialog.append(title, description, form); document.body.append(dialog); dialog.showModal();
    for (const field of fields) field.list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
    form.querySelector('button[aria-selected=true]')?.focus();
  });
}

function buildFields(today, limit, initial, wheels, inputs) {
  const fields = [];
  for (const [index, label, start, end, selected] of [
    [0, '연', today.getFullYear(), limit.getFullYear(), initial.getFullYear()],
    [1, '월', 1, 12, initial.getMonth() + 1], [2, '일', 1, 31, initial.getDate()]
  ]) {
    const field = document.createElement('div');
    const caption = document.createElement('p'); caption.textContent = label;
    const list = document.createElement('div'); list.className = 'pm-notify-date-wheel';
    list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', `${label} 선택`);
    const direct = document.createElement('label'); direct.textContent = `${label} 직접 입력`;
    const input = document.createElement('input'); input.type = 'number'; input.inputMode = 'numeric';
    input.min = String(start); input.max = String(end); input.required = true; input.value = String(selected);
    direct.append(input); inputs.append(direct); fields.push({ list, input, label, index });
    fillOptions(fields[index], start, end);
    field.append(caption, list); wheels.append(field);
    input.addEventListener('input', () => { markSelected(fields[index]); updateDays(index); });
  }
  function markSelected(field) {
    for (const option of field.list.children) option.setAttribute('aria-selected', String(option.dataset.value === field.input.value));
  }
  function fillOptions(field, start, end) {
    field.list.replaceChildren();
    for (let number = start; number <= end; number++) {
      const option = document.createElement('button'); option.type = 'button'; option.setAttribute('role', 'option');
      option.dataset.value = String(number); option.textContent = `${number}${field.label === '연' ? '년' : field.label}`;
      option.addEventListener('click', () => { field.input.value = String(number); markSelected(field); updateDays(field.index); });
      field.list.append(option);
    }
    markSelected(field);
  }
  function updateDays(index) {
    if (index === 2) return;
    const year = Number(fields[0].input.value), month = Number(fields[1].input.value);
    if (!year || month < 1 || month > 12) return;
    const days = new Date(year, month, 0).getDate();
    fields[2].input.value = String(Math.min(Number(fields[2].input.value) || 1, days));
    fields[2].input.max = String(days); fillOptions(fields[2], 1, days);
  }
  return { fields, updateDays };
}
