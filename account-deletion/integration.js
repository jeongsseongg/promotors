(() => {
  'use strict';
  let pendingOpen = new URL(location.href).searchParams.get('accountDeletion') === '1';
  let deletionPending = false, observedForm;
  const initialDisabled = new WeakMap();
  function restrictProfile() {
    for (const form of document.querySelectorAll('#my-info-form,#my-pw-form')) {
      form.querySelectorAll('input,button').forEach(control => {
        if (!initialDisabled.has(control)) initialDisabled.set(control,control.disabled);
        control.disabled = deletionPending || initialDisabled.get(control);
      });
    }
    const error = document.getElementById('mi-error');
    if (error && deletionPending) error.textContent = '탈퇴 신청 처리 중에는 정보를 변경할 수 없습니다. 신청을 취소한 후 이용해 주세요.';
  }
  async function deletionRpc(name, args) {
    const result = await supabaseRpc(name,args);
    if (name === 'pm_account_deletion') { deletionPending = ['pending','processing','needs_review'].includes(result.status); restrictProfile(); }
    return result;
  }
  const api = PMAccountDeletion.create({ rpc: deletionRpc, getToken: () => authToken, onSessionDeleted: async () => {
    await window.PMPush?.disconnect();
    clearAuthSession(); privacyClearMemory();
    member = null; isAdmin = false; adminRole = ''; adminBranches = [];
    applyAuthUI(); showView('intro');
    await privacyClearAssets();
  }});
  window.PMDeletionBridge = { open: () => api.open(), sessionChanged: async () => {
    await api.restore().catch(() => {});
    if (pendingOpen) {
      pendingOpen = false;
      const url = new URL(location.href); url.searchParams.delete('accountDeletion'); history.replaceState(history.state,'',url);
      await api.open();
    }
  }};
  document.addEventListener('click', event => {
    if (event.target.closest('#pm-account-delete')) {
      event.preventDefault(); window.PMDeletionBridge.open();
    }
  });
  new MutationObserver(() => {
    const form = document.getElementById('my-info-form');
    if (!form || form === observedForm) return;
    observedForm = form; restrictProfile(); api.restore().catch(() => {});
  }).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('pm-deletion-login', () => {
    document.querySelector('.pm-delete-dialog')?.dispatchEvent(new Event('cancel', { cancelable:true }));
    pendingOpen = true; openMemberModal('login');
  });
})();
