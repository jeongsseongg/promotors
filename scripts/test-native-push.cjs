const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../ios-app/web/notifications/native-push.js'), 'utf8');
function setup() {
  const listeners = new Map(), events = [], calls = [];
  let registrations = 0;
  const plugin = {
    checkPermissions: async () => ({ receive: 'granted' }),
    requestPermissions: async () => ({ receive: 'granted' }),
    addListener: async (name, fn) => { listeners.set(name, fn); return { remove: async () => listeners.delete(name) }; },
    register: async () => { registrations++; listeners.get('registration')({ value: 'a'.repeat(64) }); },
    removeAllDeliveredNotifications: async () => calls.push('clear'), unregister: async () => calls.push('unregister')
  };
  const window = { Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true, registerPlugin: () => plugin },
    dispatchEvent: event => events.push(event) };
  vm.runInNewContext(source, { window, setTimeout, clearTimeout, CustomEvent: class { constructor(type, data) { this.type = type; this.detail = data.detail; } } });
  return { api: window.PMNativePush, plugin, listeners, events, calls, registrations: () => registrations };
}
test('permission alone does not register a device or claim account delivery', async () => {
  const s = setup(); assert.equal(await s.api.request(), 'granted');
  assert.equal(s.registrations(), 0); assert.equal(s.api.connected, false);
});
test('native token is bound via authenticated API; cold-start tap waits for matching binding', async () => {
  const s = setup(); s.listeners.get('pushNotificationActionPerformed')({ notification: { data: { id: 'notice', binding: 'binding-a' } } });
  assert.equal(s.events.length, 0);
  await s.api.subscribe(async (action, data) => {
    assert.equal(action, 'native_subscribe'); assert.equal(data.token, 'a'.repeat(64)); return { binding: 'binding-a' };
  }, 'device');
  assert.equal(s.api.connected, true); assert.equal(s.events[0].detail.id, 'notice');
});
test('other-account taps are ignored and logout clears delivery state', async () => {
  const s = setup(); await s.api.subscribe(async () => ({ binding: 'a' }), 'device');
  s.listeners.get('pushNotificationActionPerformed')({ notification: { data: { id: 'private', binding: 'b' } } });
  assert.equal(s.events.length, 0); await s.api.clear(); assert.equal(s.api.connected, false);
  assert.deepEqual(s.calls, ['clear', 'unregister']);
});
test('logout during registration cannot bind the next account', async () => {
  const s = setup(); let rpcCalls = 0;
  s.plugin.register = async () => {};
  const pending = s.api.subscribe(async () => { rpcCalls++; return { binding: 'a' }; }, 'device');
  await new Promise(resolve => setImmediate(resolve));
  const callback = s.listeners.get('registration'); await s.api.clear(); callback({ value: 'a'.repeat(64) });
  await assert.rejects(pending, /로그인 상태/); assert.equal(rpcCalls, 0);
});
test('server rejection is never reported as connected', async () => {
  const s = setup(); await assert.rejects(s.api.subscribe(async () => { throw new Error('offline'); }, 'device'), /offline/);
  assert.equal(s.api.connected, false);
});
