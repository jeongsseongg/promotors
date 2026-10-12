const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
test('Android uses existing Web Push subscription and preserves marketing opt-out', async () => {
  const calls = [], bindings = [], values = new Map(); let subscribed = false;
  const subscription = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/test', keys: {} }), unsubscribe: async () => true };
  const registration = { active: { postMessage: value => bindings.push(value) },
    pushManager: { getSubscription: async () => subscribed ? subscription : null,
      subscribe: async () => { subscribed = true; return subscription; } } };
  const window = { isSecureContext: true, Notification: { permission: 'granted' }, PushManager: {} };
  const context = { window, Notification: window.Notification,
    navigator: { serviceWorker: { ready: Promise.resolve(registration), getRegistration: async () => registration } },
    crypto: { randomUUID: () => 'device-a' }, atob: value => Buffer.from(value, 'base64').toString('binary'),
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../android-web/notifications/notifications.js'), 'utf8'), context);
  const api = window.PMNotifications.create({ getToken: () => 'session', openTarget: () => {}, rpc: async (name, args) => {
    calls.push({ name, ...args });
    return args.p_action === 'state' ? { publicKey: 'YQ', preferences: { enabled: false, marketing: false } } : { binding: 'safe-binding' };
  } });
  await api.enable();
  assert.equal(subscribed, true);
  assert.deepEqual(calls.map(x => x.p_action), ['state', 'subscribe', 'preferences', 'state']);
  assert.equal(calls.every(x => x.name === 'pm_notifications'), true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[2].p_data)), { enabled: true });
  assert.equal(bindings[0].binding, 'safe-binding');
});
