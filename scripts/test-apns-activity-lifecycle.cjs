const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {stripTypeScriptTypes} = require('node:module');
const root = path.join(__dirname, '..');
const normal = 'a'.repeat(64), start = 'b'.repeat(64), update = 'c'.repeat(64), fresh = 'd'.repeat(64);
const id = '11111111-1111-4111-8111-111111111111', lease = '22222222-2222-4222-8222-222222222222';
const response = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), {status});
function evaluate(file, environment, addition = '') {
  const source = fs.readFileSync(path.join(root, file), 'utf8') + addition;
  const exposed = [];
  const code = stripTypeScriptTypes(source)
    .replace(/^import \{ ([^}]+) \} from '([^']+)';$/gm, "const { $1 } = require('$2');")
    .replace(/^import ([A-Za-z_$][\w$]*) from '([^']+)';$/gm, "const $1 = require('$2');")
    .replace(/^export (async )?function ([A-Za-z_$][\w$]*)/gm, (_, asyncKeyword, name) => {
      exposed.push(name); return `${asyncKeyword || ''}function ${name}`;
    })
    .replace(/export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\s*\};?/g, 'module.exports.$2 = $1;');
  const module = {exports: {}};
  vm.runInNewContext(code + exposed.map(name => `\nmodule.exports.${name} = ${name};`).join(''), {module, exports: module.exports, AbortSignal, Response, Date,
    crypto: require('node:crypto').webcrypto, TextEncoder, console: {error() {}}, ...environment});
  return module.exports;
}
function apns(status = 200, reason = 'Unregistered') {
  const requests = [];
  class SignJWT {setProtectedHeader() {return this;} setIssuer() {return this;} setIssuedAt() {return this;} async sign() {return 'synthetic-bearer';}}
  const source = evaluate('notifications/process-push-queue/apns.ts', {
    require: name => {assert.equal(name, 'npm:jose@6.1.0'); return {importPKCS8: async () => ({}), SignJWT};},
    Deno: {env: {get: () => 'SYNTHETIC-ONLY'}},
    fetch: async (url, init) => {
      assert.ok(url.startsWith('https://api.push.apple.com/3/device/'));
      const token = url.split('/').pop(), event = JSON.parse(init.body).aps.event;
      assert.ok([normal, start, update, fresh].includes(token), 'only synthetic tokens are accepted by this mock');
      requests.push({token, event: event || 'alert'});
      return response(status >= 400 && event ? {reason} : null, event ? status : 200);
    },
  });
  return {...source, requests};
}
function payload(count = 1, delivered = false) {
  return {id, binding: lease, category: 'booking', alertDelivered: delivered, booking: {id: 'qa-booking', pending: count > 0,
    branch: 'QA branch', schedule: 'QA schedule', snapshot: {pendingCount: count, upcomingCount: 0}}};
}
function worker(outcome, {feedbackFails = false, current = update} = {}) {
  const calls = [], acknowledgments = [], subscription = {transport: 'apns', token: normal, activityStart: start, activityUpdate: current};
  const source = evaluate('notifications/process-push-queue/index.ts', {
    require: name => {
      if (name === './apns.ts') return {sendAPNS: async () => outcome};
      if (name === './fcm.ts') return {sendFCM: async () => {throw new Error('unexpected FCM');}};
      assert.equal(name, 'npm:web-push@3.6.7'); return {};
    },
    Deno: {env: {get: key => key === 'SUPABASE_URL' ? 'https://synthetic.invalid' : 'SYNTHETIC-ONLY'}, serve() {}},
    fetch: async (url, init) => {
      assert.ok(url.startsWith('https://synthetic.invalid/rest/v1/rpc/'), 'production requests are forbidden');
      const name = url.split('/').pop(), body = JSON.parse(init.body);
      calls.push({name, body});
      if (name === 'pm_push_worker') {
        if (body.p_action === 'validate') return response({valid: true});
        assert.equal(body.p_action, 'ack'); acknowledgments.push(body.p_data); return response({ok: true});
      }
      if (name === 'pm_booking_push_context') return response(payload(1).booking);
      assert.equal(name, 'pm_push_activity_clear');
      if (feedbackFails) return response({code: 'SYNTHETIC_UNAVAILABLE'}, 503);
      assert.equal(body.p_id, id); assert.equal(body.p_lease, lease); assert.equal(body.p_expected_update, update);
      const cleared = subscription.activityUpdate === body.p_expected_update;
      if (cleared) delete subscription.activityUpdate;
      return response({ok: true, cleared});
    },
  }, '\nexport { deliver as auditedDeliver };');
  return {calls, acknowledgments, subscription, run: () => source.auditedDeliver({id, leaseId: lease, subscription: {...subscription}, payload: payload(1)}, {})};
}
test('successful Activity end returns an internal exact-token cleanup signal', async () => {
  const f = apns(), subscription = {token: normal, activityStart: start, activityUpdate: update};
  const result = await f.sendAPNS(subscription, payload(0, true));
  assert.equal(result.ok, true); assert.equal(result.code, '200'); assert.equal(result.clearActivityUpdate, update);
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].event, 'end');
});
for (const [status, reason] of [[410, 'Unregistered'], [400, 'BadDeviceToken'], [400, 'DeviceTokenNotForTopic']]) {
  test(`expired Activity update ${status}/${reason} returns cleanup without replaying the alert`, async () => {
    const f = apns(status, reason), result = await f.sendAPNS({token: normal, activityStart: start, activityUpdate: update}, payload(1, true));
    assert.equal(result.ok, false); assert.equal(result.code, `ACTIVITY_${status}_ALERT_SENT`);
    assert.equal(result.clearActivityUpdate, update); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].event, 'update');
  });
}
test('payload errors and invalid ordinary device tokens never clear Activity credentials', async () => {
  const f = apns(400, 'PayloadEmpty'), result = await f.sendAPNS({token: normal, activityStart: start, activityUpdate: update}, payload(1, true));
  assert.equal(result.clearActivityUpdate, undefined);
  const invalid = await f.sendAPNS({token: 'invalid', activityUpdate: update}, payload(1));
  assert.equal(invalid.code, '410'); assert.equal(invalid.clearActivityUpdate, undefined);
});
test('worker persists cleanup before acknowledging a successful end', async () => {
  const f = worker({ok: true, code: '200', clearActivityUpdate: update}); await f.run();
  const feedback = f.calls.findIndex(call => call.name === 'pm_push_activity_clear');
  const ack = f.calls.findIndex(call => call.name === 'pm_push_worker' && call.body.p_action === 'ack');
  assert.ok(feedback >= 0 && feedback < ack); assert.equal(f.subscription.activityUpdate, undefined);
  assert.equal(f.subscription.activityStart, start); assert.equal(f.subscription.token, normal);
  assert.equal(f.acknowledgments[0].result, 'sent');
  assert.equal(f.acknowledgments[0].clearActivityUpdate, undefined, 'tokens are never included in delivery audit metadata');
});
test('stale update cleanup retains ALERT_SENT and the next attempt selects start without another alert', async () => {
  const f = worker({ok: false, code: 'ACTIVITY_410_ALERT_SENT', clearActivityUpdate: update}); await f.run();
  assert.equal(f.subscription.activityUpdate, undefined); assert.equal(f.acknowledgments[0].code, 'ACTIVITY_410_ALERT_SENT');
  const retry = apns(), result = await retry.sendAPNS(f.subscription, payload(1, true));
  assert.equal(result.ok, true); assert.equal(retry.requests.length, 1); assert.equal(retry.requests[0].event, 'start');
  assert.equal(retry.requests[0].token, start);
});
test('feedback transport failure keeps ALERT_SENT so the worker never retries an ordinary alert', async () => {
  const f = worker({ok: true, code: '200', clearActivityUpdate: update}, {feedbackFails: true}); await f.run();
  assert.equal(f.subscription.activityUpdate, update); assert.equal(f.acknowledgments[0].result, 'failed');
  assert.equal(f.acknowledgments[0].code, 'ACTIVITY_FEEDBACK_ERROR_ALERT_SENT');
});
test('a failed end retry also cleans the expired token after a previous end acknowledgment was lost', async () => {
  const f = apns(410), result = await f.sendAPNS({token: normal, activityStart: start, activityUpdate: update}, payload(0, true));
  assert.equal(result.clearActivityUpdate, update); assert.equal(result.code, 'ACTIVITY_410_ALERT_SENT');
});
test('an update token registered during feedback is preserved', async () => {
  const f = worker({ok: true, code: '200', clearActivityUpdate: update}, {current: fresh}); await f.run();
  assert.equal(f.subscription.activityUpdate, fresh); assert.equal(f.acknowledgments[0].result, 'sent');
});
