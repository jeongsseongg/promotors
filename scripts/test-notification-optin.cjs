const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../ios-app/web/notifications/notifications.js'), 'utf8');
function setup(permission = 'granted', failure = false) {
  const calls = [], values = new Map();
  const native = { available: true, connected: false, permission,
    check: async () => permission, request: async () => permission,
    clear: async () => { native.connected = false; },
    subscribe: async (call, deviceId) => { await call('native_subscribe', { deviceId, token: 'test-token' }); native.connected = true; } };
  const window = { PMNativePush: native };
  vm.runInNewContext(source, { window, localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    crypto: { randomUUID: () => 'device-id' }, navigator: {}, setTimeout, clearTimeout });
  const api = window.PMNotifications.create({ getToken: () => 'session-a', openTarget: () => {}, rpc: async (name, data) => {
    calls.push({ name, ...data });
    if (data.p_action === 'native_subscribe' && failure) throw new Error('offline');
    if (data.p_action === 'state') return { preferences: { enabled: false }, items: [] };
    return { binding: 'binding-a' };
  } });
  return { api, calls };
}
test('native enable registers the device before enabling preferences; never enables marketing', async () => {
  const s = setup(); await s.api.enable();
  assert.deepEqual(s.calls.map(c => c.p_action), ['state', 'native_subscribe', 'preferences', 'state']);
  assert.equal(s.calls[1].name, 'pm_native_push_subscribe');
  assert.equal(s.calls[1].p_token, 'session-a');
  assert.deepEqual(JSON.parse(JSON.stringify(s.calls[2].p_data)), { enabled: true });
});
test('denial does not subscribe or enable an account', async () => {
  const s = setup('denied'); await assert.rejects(s.api.enable(), /허용/);
  assert.deepEqual(s.calls.map(c => c.p_action), ['state']);
});
test('failed registration does not enable preferences', async () => {
  const s = setup('granted', true); await assert.rejects(s.api.enable(), /offline/);
  assert.equal(s.calls.some(c => c.p_action === 'preferences'), false);
});
