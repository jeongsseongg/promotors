(function (global) {
  'use strict';
  const RECEIPT_KEY = 'my-deletion-receipt';
  const errors = {
    DELETION_NOT_READY: '탈퇴 신청 기능을 준비 중입니다. 고객센터에 문의해 주세요.',
    ACCOUNT_DELETION_PENDING: '탈퇴 신청 처리 중에는 정보를 변경할 수 없습니다. 신청을 취소한 후 이용해 주세요.',
    AUTH_REQUIRED: '로그인이 필요합니다. 다시 로그인해 주세요.',
    INVALID_SESSION: '로그인 시간이 만료되었습니다. 다시 로그인해 주세요.',
    INVALID_PASSWORD: '현재 비밀번호가 일치하지 않습니다.',
    TRY_LATER: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    INVALID_RECEIPT: '조회 정보가 유효하지 않거나 완료 또는 취소 후 30일의 조회 기간이 지났습니다.',
    RECEIPT_EXPIRED: '완료 또는 취소 후 30일의 조회 기간이 지났습니다.',
    NOT_CANCELLABLE: '실제 삭제가 시작되어 신청을 취소할 수 없습니다.',
    ALREADY_PROCESSING: '이미 삭제 처리 중입니다. 완료 상태를 확인해 주세요.'
  };
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function button(text, handler, className = 'pm-delete-button') {
    const el = node('button', text, className);
    el.type = 'button'; el.addEventListener('click', handler);
    return el;
  }
  function date(value) {
    if (!value || Number.isNaN(new Date(value).getTime())) return '확인 중';
    return `${new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} (한국 시간)`;
  }
  function explain(error) {
    const code = `${error?.code || ''} ${error?.message || ''}`;
    const matched = Object.keys(errors).find(key => code.includes(key));
    return matched ? errors[matched] : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
  function create({ rpc, getToken, onSessionDeleted, confirmAction }) {
    let dialog, content, feedback, opener, busy = false, state, receiptOnly = false, notified = false, finishConfirmation;
    async function request(name, args) {
      let result = await rpc(name, args);
      if (result?.error) throw result.error;
      if (result?.data !== undefined) result = result.data;
      if (Array.isArray(result)) result = result[0];
      if (result?.ok === false) throw { code: result.code, message: result.message };
      if (!result || typeof result.status !== 'string') throw new Error('INVALID_RESPONSE');
      return result;
    }
    async function call(action, data = {}) {
      const token = getToken();
      if (!token) throw new Error('AUTH_REQUIRED');
      const result = await request('pm_account_deletion', { p_token: token, p_action: action, p_data: data });
      if (token !== getToken()) throw new Error('AUTH_REQUIRED');
      return result;
    }
    function receipt() {
      try { return localStorage.getItem(RECEIPT_KEY); } catch { return null; }
    }
    function message(text, error = false) {
      if (!feedback) return;
      feedback.textContent = text;
      feedback.classList.toggle('pm-delete-error', error);
    }
    async function perform(action) {
      if (busy) return;
      busy = true; dialog?.setAttribute('aria-busy', 'true');
      try { await action(); }
      catch (error) { message(explain(error), true); }
      finally { busy = false; dialog?.removeAttribute('aria-busy'); }
    }
    async function apply(next) {
      state = next;
      if (state.status !== 'completed') notified = false;
      render();
      if (state.status === 'completed' && !notified) {
        notified = true;
        await onSessionDeleted?.();
      }
    }
    async function refresh() {
      receiptOnly = !getToken();
      if (!receiptOnly) {
        try { await apply(await call('state')); return; }
        catch (error) {
          if (!/AUTH_REQUIRED|INVALID_SESSION/.test(`${error?.code || ''} ${error?.message || ''}`) || !receipt()) throw error;
          receiptOnly = true;
        }
      }
      if (!receipt()) { await apply({ status: 'none' }); return; }
      const token = getToken();
      const result = await request('pm_deletion_receipt', { p_receipt: receipt() });
      if (token !== getToken()) throw new Error('AUTH_REQUIRED');
      await apply(result);
    }
    async function restore() {
      if (!getToken() && !receipt()) return;
      await refresh();
    }
    function close() {
      finishConfirmation?.(false);
      if (!dialog) return;
      dialog.close(); dialog.remove();
      dialog = undefined; content = undefined; feedback = undefined;
      opener?.focus();
    }
    async function open() {
      if (dialog) { dialog.focus(); return; }
      opener = document.activeElement;
      dialog = node('dialog', undefined, 'pm-delete-dialog');
      dialog.setAttribute('aria-labelledby', 'pm-delete-title');
      const header = node('header', undefined, 'pm-delete-header');
      const titleGroup = node('div');
      const title = node('h2', '회원 탈퇴'); title.id = 'pm-delete-title';
      titleGroup.append(node('span', '프로모터스', 'pm-delete-brand'), title);
      const closeButton = button('×', close, 'pm-delete-close'); closeButton.setAttribute('aria-label','닫기');
      header.append(titleGroup, closeButton);
      feedback = node('p', '처리 상태를 확인하고 있습니다.', 'pm-delete-feedback');
      feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
      content = node('div', undefined, 'pm-delete-content');
      dialog.append(header, feedback, content);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      document.body.append(dialog); dialog.showModal();
      await perform(async () => { await refresh(); message(''); });
    }
    function policy() {
      const section = node('section', undefined, 'pm-delete-section');
      const list = node('ul');
      for (const text of [
        '신청 72시간 후 계정·연락처·사진 등 불필요한 개인정보를 삭제합니다.',
        '정비 이력은 개인 식별정보를 제거해 남깁니다. 법정 보관 자료는 별도 보관합니다.',
        '신청 중에는 일반 회원정보 변경이 제한됩니다.',
        '실제 삭제가 시작되기 전에는 언제든 취소할 수 있습니다.'
      ]) list.append(node('li', text));
      section.append(list); return section;
    }
    function render() {
      if (!content || !state) return;
      content.replaceChildren();
      if (state.status === 'none' || state.status === 'cancelled') {
        content.append(policy());
        if (!receiptOnly && getToken()) content.append(application());
        else { content.append(node('p', '새로 탈퇴를 신청하려면 먼저 로그인해 주세요.')); content.append(button('로그인하고 탈퇴 신청', () => global.dispatchEvent(new Event('pm-deletion-login')))); }
      } else content.append(progress());
      content.append(button('처리 상태 새로고침', () => perform(async () => { await refresh(); message('현재 처리 상태를 확인했습니다.'); })));
      content.append(node('p', '이 기기에서는 로그아웃해도 완료·취소 후 30일까지 상태를 조회할 수 있습니다. 브라우저 데이터를 지우면 조회 정보도 사라집니다.', 'pm-delete-muted pm-delete-receipt-note'));
    }
    function application() {
      const form = node('form', undefined, 'pm-delete-form');
      const label = node('label', '현재 비밀번호');
      const password = node('input'); password.type = 'password'; password.required = true;
      password.autocomplete = 'current-password'; label.append(password);
      const acknowledgement = node('label', undefined, 'pm-delete-check');
      const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.required = true;
      acknowledgement.append(checkbox, node('span', '삭제 일정과 보관·취소 안내를 확인했습니다.'));
      const submit = node('button', '회원 탈퇴 신청', 'pm-delete-button pm-delete-primary');
      submit.type = 'submit'; submit.disabled = true;
      checkbox.addEventListener('change', () => { submit.disabled = !checkbox.checked; });
      form.append(label, acknowledgement, submit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!checkbox.checked || !password.value || busy) return;
        perform(async () => {
          if (!await confirm('탈퇴를 신청할까요?', '신청 72시간 후부터 삭제를 진행합니다. 실제 삭제가 시작되기 전에는 언제든 신청을 취소할 수 있습니다.', '탈퇴 신청 확인')) return;
          let savedReceipt = true;
          try {
            const result = await call('request', { password: password.value });
            if (result.receipt) {
              try { localStorage.setItem(RECEIPT_KEY, result.receipt); }
              catch { savedReceipt = false; }
            }
            await apply(result);
            message(savedReceipt ? '탈퇴 신청을 접수했습니다. 아래의 삭제 예정 시간을 확인해 주세요.' : '신청은 접수됐지만 이 기기에 조회 정보를 저장하지 못했습니다. 로그인 상태에서 처리 일정을 확인해 주세요.');
          } finally { password.value = ''; }
        });
      });
      return form;
    }
    function progress() {
      const section = node('section', undefined, 'pm-delete-section');
      const headings = { pending: '탈퇴 신청이 접수되었습니다', processing: '계정 삭제를 처리하고 있습니다', completed: '계정 삭제가 완료되었습니다', needs_review: '삭제 요청을 확인하고 있습니다' };
      section.append(node('h3', headings[state.status] || '처리 상태를 확인해 주세요'));
      if (state.requestedAt) section.append(node('p', `신청 시간: ${date(state.requestedAt)}`));
      if (state.scheduledFor && state.status !== 'completed') section.append(node('p', `삭제 예정: ${date(state.scheduledFor)}`));
      if (state.completedAt) section.append(node('p', `삭제 완료: ${date(state.completedAt)}`));
      if (state.status === 'completed') section.append(node('p', '계정·연락처·사진 등 삭제 대상 개인정보의 처리가 완료되었습니다. 정비 이력은 개인 식별정보를 제거해 남깁니다. 법정 보관 자료는 분리 보관됩니다.'));
      if (state.status === 'needs_review') section.append(node('p', '삭제 요청에 추가 확인이 필요합니다. 완료로 표시되기 전까지는 삭제가 끝난 상태가 아닙니다.'));
      if (['pending', 'processing', 'needs_review'].includes(state.status)) pendingActions(section);
      return section;
    }
    function pendingActions(section) {
      section.append(node('p', '신청 후에는 일반 회원정보 변경이 제한됩니다.'));
      if (state.canCancel === true) {
        if (!receiptOnly && getToken()) section.append(button('탈퇴 신청 취소', () => perform(async () => {
          if (!await confirm('탈퇴 신청을 취소할까요?', '탈퇴 신청을 취소하면 계정을 계속 사용할 수 있습니다.', '탈퇴 신청 취소 확인')) return;
          await apply(await call('cancel')); message('탈퇴 신청을 취소했습니다.');
        })));
        else section.append(node('p', '실제 삭제가 시작되기 전에 로그인하면 탈퇴 신청을 취소할 수 있습니다.'));
      } else section.append(node('p', '현재 신청 취소가 가능하지 않습니다. 처리 상태를 새로고침해 주세요.'));
    }
    async function confirm(title, text, okText) {
      if (typeof confirmAction === 'function') {
        const current = dialog; current.close();
        try { return await confirmAction(text, { title, okText, cancelText: '돌아가기' }); }
        finally { if (dialog === current) current.showModal(); }
      }
      const previous = [...content.childNodes];
      const section = node('section', undefined, 'pm-delete-confirm');
      section.append(node('span', '프로모터스', 'pm-delete-brand'), node('h3', title), node('p', text));
      const actions = node('div', undefined, 'pm-delete-confirm-actions');
      const result = new Promise(resolve => {
        finishConfirmation = resolve;
        actions.append(button('돌아가기', () => resolve(false)), button(okText, () => resolve(true), 'pm-delete-button pm-delete-primary'));
      });
      section.append(actions); content.replaceChildren(section); actions.firstElementChild.focus();
      try { return await result; }
      finally { finishConfirmation = undefined; if (content) content.replaceChildren(...previous); }
    }
    return { open, restore };
  }
  global.PMAccountDeletion = Object.freeze({ create });
})(window);

