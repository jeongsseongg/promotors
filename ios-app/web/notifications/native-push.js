/* Native iOS transport; Android TWA continues to use the existing Web Push path. */
(() => {
  'use strict';
  const cap = window.Capacitor;
  const available = cap?.isNativePlatform?.() && cap.isPluginAvailable('PushNotifications');
  const plugin = available ? cap.registerPlugin('PushNotifications') : null;
  let permission = 'default', token = null, registration, binding = null, pendingTap = null, epoch = 0;
  function openPending() {
    if (!pendingTap || !binding) return;
    const data = pendingTap; pendingTap = null;
    if (data.binding === binding && data.id) {
      window.dispatchEvent(new CustomEvent('pm-native-notification', { detail: { id: data.id } }));
    }
  }
  async function check() {
    if (!plugin) return 'default';
    const result = await plugin.checkPermissions();
    permission = result.receive === 'granted' ? 'granted' : result.receive === 'denied' ? 'denied' : 'default';
    return permission;
  }
  async function request() {
    const result = await plugin.requestPermissions();
    permission = result.receive === 'granted' ? 'granted' : result.receive === 'denied' ? 'denied' : 'default';
    return permission;
  }
  async function deviceToken() {
    if (token) return token;
    if (registration) return registration;
    const current = epoch;
    registration = (async () => {
      const handles = [];
      let timeout;
      try {
        return await new Promise((resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('기기 알림 등록이 지연됩니다. 잠시 후 다시 시도해 주세요.')), 20000);
          (async () => {
            handles.push(await plugin.addListener('registration', value => {
              if (current !== epoch) return reject(new Error('로그인 상태가 변경되었습니다.'));
              token = value.value; resolve(token);
            }));
            handles.push(await plugin.addListener('registrationError', () => reject(new Error('기기 알림 등록에 실패했습니다. 다시 시도해 주세요.'))));
            await plugin.register();
          })().catch(reject);
        });
      } finally {
        clearTimeout(timeout);
        await Promise.all(handles.map(handle => handle.remove()));
        registration = null;
      }
    })();
    return registration;
  }
  async function subscribe(call, deviceId) {
    const current = epoch;
    const value = await deviceToken();
    if (current !== epoch) throw new Error('로그인 상태가 변경되었습니다.');
    const result = await call('native_subscribe', { deviceId, token: value });
    if (current !== epoch) throw new Error('로그인 상태가 변경되었습니다.');
    binding = result.binding;
    openPending();
  }
  async function clear() {
    epoch += 1; token = null; binding = null; pendingTap = null;
    if (plugin) {
      await plugin.removeAllDeliveredNotifications();
      await plugin.unregister();
    }
  }
  if (plugin) {
    plugin.addListener('pushNotificationActionPerformed', event => {
      const data = event.notification.data || {};
      pendingTap = data; openPending();
    });
  }
  window.PMNativePush = { available: Boolean(available), check, request, subscribe, clear,
    get permission() { return permission; }, get connected() { return Boolean(binding); } };
})();
