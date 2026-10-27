const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const release = require('../native-app/release.json');
const source = fs.readFileSync(path.join(__dirname, '../native-app/scripts/submit-appstore-review.cjs'), 'utf8');
const APP = '6810716100', BUNDLE = 'kr.promotors.app';
const OLD = String(release.iosBuild - 1), TARGET = String(release.iosBuild);
const relation = (type, id) => ({data: {type, id}});

function fixture(change = {}) {
  return {calls: [], unexpected: [], bundle: BUNDLE, targetState: 'WAITING_FOR_REVIEW',
    attached: 'old', oldNumber: OLD, oldVersion: release.version, oldApp: APP,
    oldBundle: BUNDLE, submissionCount: 1, itemCount: 1, itemVersion: 'version',
    submissionState: 'WAITING_FOR_REVIEW', freshState: null, processing: 'VALID',
    encryption: false, targetVersion: release.version, canceled: false, releaseType: 'MANUAL',
    submittedDate: '2001-01-01T00:00:00Z', readCounts: {}, ...change};
}

function version(state) {
  return {type: 'appStoreVersions', id: state.versionId || 'version', attributes: {
    versionString: state.targetVersion, appStoreState: state.targetState, releaseType: state.releaseType}};
}

function submission(state, id = 'submission') {
  return {type: 'reviewSubmissions', id, attributes: {
    state: state.canceled ? 'COMPLETE' : state.submissionState, submittedDate: state.submittedDate},
  relationships: {items: {data: [{type: 'reviewSubmissionItems', id: 'item'}]}}};
}

function items(state) {
  return Array.from({length: state.itemCount}, (_, i) => ({type: 'reviewSubmissionItems',
    id: 'item' + (i || ''), attributes: {state: state.itemState || 'READY_FOR_REVIEW'},
    relationships: {appStoreVersion: relation('appStoreVersions', state.itemVersion)}}));
}

function build(state, old = false) {
  return {type: 'builds', id: old ? 'old' : 'target', attributes: {
    version: old ? state.oldNumber : (state.buildNumber || TARGET), processingState: state.processing,
    usesNonExemptEncryption: state.encryption},
  relationships: {app: relation('apps', old ? state.oldApp : APP)}};
}

function read(state, endpoint) {
  state.readCounts[endpoint] = (state.readCounts[endpoint] || 0) + 1;
  state.onRead?.(state, endpoint, state.readCounts[endpoint]);
  if (endpoint === `/v1/apps/${APP}`) return {data: {id: APP, attributes: {bundleId: state.bundle}}};
  if (endpoint.startsWith(`/v1/apps/${APP}/appStoreVersions?`)) return {data: [...(state.targetMissing ? [] : [version(state)]), {
    id: 'previous', attributes: {versionString: '0.0.1', appStoreState: 'READY_FOR_SALE'}}]};
  if (endpoint.startsWith('/v1/builds?')) return {data: Array.from({length: state.buildCount ?? 1}, () => build(state))};
  if (endpoint === '/v1/builds/target/preReleaseVersion') return {data: {attributes: {version: state.buildVersion || release.version}}};
  if (endpoint === '/v1/builds/old/preReleaseVersion') return {data: {attributes: {version: state.oldVersion}}};
  if (endpoint === '/v1/builds/old/app') return {data: {id: state.oldApp, attributes: {bundleId: state.oldBundle}}};
  if (endpoint === '/v1/builds/target/app') return {data: {id: APP, attributes: {bundleId: BUNDLE}}};
  if (endpoint === '/v1/builds/old') return {data: build(state, true)};
  if (endpoint === '/v1/builds/target') return {data: build(state)};
  if (endpoint.startsWith(`/v1/apps/${APP}/reviewSubmissions?`)) return {
    data: Array.from({length: state.submissionCount}, (_, i) => submission(state, 'submission' + (i || ''))),
    included: items(state)};
  if (/^\/v1\/reviewSubmissions\/submission\d*\/items\?/.test(endpoint)) return {data: items(state)};
  if (endpoint === '/v1/reviewSubmissions/submission') {
    const result = submission(state);
    if (state.singleSubmissionId) result.id = state.singleSubmissionId;
    if (state.freshState) result.attributes.state = state.freshState;
    return {data: result};
  }
  if (endpoint === '/v1/appStoreVersions/version') return {data: version(state)};
  if (endpoint === '/v1/appStoreVersions/version/relationships/build') return {
    data: state.attached ? {type: 'builds', id: state.attached} : null};
  if (/^\/v1\/appStoreVersions\/(version|previous)\/appStoreVersionLocalizations\?/.test(endpoint)) return {
    data: [{id: 'ko', attributes: {locale: 'ko', whatsNew: state.notes || '기존 설명'}}]};
  if (endpoint.startsWith('/v1/appStoreVersionLocalizations/ko/appScreenshotSets?')) return {
    data: [{id: 'screenshots', attributes: {screenshotDisplayType: 'APP_IPHONE_67'},
      relationships: {appScreenshots: {data: [{id: 'image'}]}}}]};
  if (endpoint === '/v1/appStoreVersions/version/appStoreReviewDetail') return {
    data: {id: 'detail', attributes: {demoAccountRequired: false, contactEmail: 'fixture@example.invalid', contactPhone: '000'}}};
  state.unexpected.push({endpoint, method: 'GET'});
  return {data: null};
}

function write(state, endpoint, method, body) {
  if (endpoint === '/v1/appStoreVersions/version' && method === 'PATCH' && body?.data?.attributes?.releaseType === 'AFTER_APPROVAL') {
    state.releaseType = body.data.attributes.releaseType; state.afterAutomaticPatch?.(state);
    return {data: version(state)};
  }
  if (state.allowPrepare && endpoint === '/v1/appStoreVersions' && method === 'POST') {
    state.targetMissing = false; state.targetState = 'PREPARE_FOR_SUBMISSION';
    state.releaseType = body.data.attributes.releaseType; return {data: version(state)};
  }
  if (state.allowPrepare && endpoint === '/v1/appStoreVersions/version/relationships/build' && method === 'PATCH') {
    state.attached = body.data.id; return {data: body.data};
  }
  if (state.allowPrepare && endpoint === '/v1/appStoreVersionLocalizations/ko' && method === 'PATCH') {
    state.notes = body.data.attributes.whatsNew; return {data: {id: 'ko', attributes: body.data.attributes}};
  }
  if (endpoint === '/v1/reviewSubmissions/submission' && method === 'PATCH' && body?.data?.attributes?.canceled === true) {
    state.canceled = true;
    state.targetState = 'DEVELOPER_REJECTED';
    return {data: submission(state)};
  }
  state.unexpected.push({endpoint, method, body});
  return {data: null};
}

async function execute(change = {}, options = {}) {
  const state = fixture(change), logs = [], errors = [];
  const env = {ASC_KEY_ID: 'fixture', ASC_ISSUER_ID: 'fixture', ASC_PRIVATE_KEY: 'fixture',
    PM_REVIEW_MODE: options.mode || 'cancel',
    PM_CONFIRM_REVIEW_VERSION: `${release.version}/${TARGET}`,
    PM_CONFIRM_REPLACED_BUILD: state.oldNumber, ...options.env};
  for (const key of Object.keys(env)) if (env[key] == null) delete env[key];
  const fakeProcess = {env, exitCode: 0};
  const fakeRequire = name => {
    if (name === '../release.json') return {...release};
    if (name === 'node:crypto') return {sign: () => Buffer.from('fixture-signature')};
    if (name === 'node:path') return path;
    if (name === 'node:fs') return {writeFileSync() {throw Error('UNEXPECTED_FILE_WRITE');}};
    throw Error('UNEXPECTED_REQUIRE');
  };
  const fetch = async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.appstoreconnect.apple.com');
    const endpoint = parsed.pathname + parsed.search, method = init.method;
    const body = init.body ? JSON.parse(init.body) : undefined;
    state.calls.push({endpoint, method, body});
    const payload = method === 'GET' ? read(state, endpoint) : write(state, endpoint, method, body);
    return {ok: true, status: 200, headers: {get: () => null}, json: async () => payload};
  };
  await vm.runInNewContext(source, {require: fakeRequire, process: fakeProcess, fetch,
    Buffer, URLSearchParams, AbortSignal, console: {log: value => logs.push(value), error: value => errors.push(value)}},
  {filename: 'submit-appstore-review.cjs', timeout: 2000});
  assert.deepEqual(state.unexpected, [], 'unexpected API or file access');
  return {state, logs, errors, exitCode: fakeProcess.exitCode,
    output: logs.length ? JSON.parse(logs.at(-1)) : null};
}

function writes(result) {return result.state.calls.filter(call => call.method !== 'GET');}

async function rejected(change, options) {
  const result = await execute(change, options);
  assert.equal(result.exitCode, 1, 'unsafe operation must fail');
  assert.equal(writes(result).length, 0, 'rejected operation must not mutate Apple state');
  return result;
}

test('prepare rejects an accepted version attached to a different build', async () => {
  const result = await rejected({}, {mode: 'prepare'});
  assert.ok(result.errors.includes('ATTACHED_BUILD_MISMATCH'));
});

test('prepare remains idempotent when the accepted version already uses the target build', async () => {
  const result = await execute({attached: 'target'}, {mode: 'prepare'});
  assert.equal(result.exitCode, 0);
  assert.equal(writes(result).length, 0);
  assert.equal(result.output.attachedBuild.id, 'target');
});

test('inspect may report an older attached build without mutating it', async () => {
  const result = await execute({}, {mode: 'inspect', env: {PM_CONFIRM_REVIEW_VERSION: null, PM_CONFIRM_REPLACED_BUILD: null}});
  assert.equal(result.exitCode, 0);
  assert.equal(result.output.attachedBuild.id, 'old');
  assert.equal(writes(result).length, 0);
});

test('submit and release reject the older attachment without mutating it', async () => {
  for (const mode of ['submit', 'release']) {
    const result = await rejected({}, {mode});
    assert.ok(result.errors.includes('ATTACHED_BUILD_MISMATCH'));
  }
});

test('cancel precisely the pending single-version submission, then return verified scope', async () => {
  for (const pending of ['WAITING_FOR_REVIEW', 'IN_REVIEW']) {
    const result = await execute({targetState: pending, submissionState: pending});
    assert.equal(result.exitCode, 0, result.errors.join('\n'));
    assert.deepEqual(writes(result), [{endpoint: '/v1/reviewSubmissions/submission', method: 'PATCH', body: {
      data: {type: 'reviewSubmissions', id: 'submission', attributes: {canceled: true}}}}]);
    assert.equal(result.output.cancelAction.versionId, 'version');
    assert.equal(result.output.cancelAction.submissionId, 'submission');
    assert.equal(String(result.output.cancelAction.previousBuild), OLD);
    assert.equal(result.output.cancelAction.beforeState, pending);
    assert.ok(Number.isFinite(Date.parse(result.output.cancelAction.requestedAt)));
    const calls = result.state.calls;
    assert.ok(calls.some(call => call.endpoint === '/v1/builds/old/app'));
    const mutationIndex = calls.findIndex(call => call.method !== 'GET');
    assert.ok(calls.slice(0, mutationIndex).some(call => call.endpoint === '/v1/reviewSubmissions/submission'));
  }
});

test('cancel requires both exact target and previous-build confirmations', async () => {
  for (const env of [{PM_CONFIRM_REVIEW_VERSION: null}, {PM_CONFIRM_REVIEW_VERSION: 'wrong'},
    {PM_CONFIRM_REPLACED_BUILD: null}, {PM_CONFIRM_REPLACED_BUILD: String(release.iosBuild - 2)}]) {
    await rejected({}, {env});
  }
});

test('cancel refuses a different app, bundle, version or invalid target build', async () => {
  for (const change of [{bundle: 'other.app'}, {oldApp: 'another-app'}, {oldBundle: 'other.app'},
    {oldVersion: release.version + '-other'}, {targetVersion: release.version + '-other'},
    {processing: 'INVALID'}, {encryption: null}, {encryption: true}]) await rejected(change);
});

test('cancel refuses absent attachment, the target itself and non-older build numbers', async () => {
  for (const change of [{attached: null}, {attached: 'target'}, {oldNumber: TARGET},
    {oldNumber: String(release.iosBuild + 1)}, {oldNumber: 'not-a-number'}]) await rejected(change);
});

test('cancel refuses ambiguous submission scopes and unrelated items', async () => {
  for (const change of [{submissionCount: 0}, {submissionCount: 2}, {itemCount: 0},
    {itemCount: 2}, {itemVersion: 'another-version'}]) await rejected(change);
});

test('cancel refuses completed, approved or editable submissions', async () => {
  for (const change of [{submissionState: 'COMPLETE', targetState: 'READY_FOR_SALE', itemState: 'APPROVED'},
    {submissionState: 'COMPLETE', targetState: 'PENDING_DEVELOPER_RELEASE', itemState: 'APPROVED'},
    {submissionState: 'READY_FOR_REVIEW', targetState: 'PREPARE_FOR_SUBMISSION'}]) await rejected(change);
});

test('cancel rechecks the current submission state before sending any mutation', async () => {
  await rejected({freshState: 'COMPLETE'});
  await rejected({freshState: 'UNRESOLVED_ISSUES'});
});
const automatic = {mode: 'automatic'}, automaticFixture = change => ({attached: 'target', ...change});
const automaticPatch = {endpoint: '/v1/appStoreVersions/version', method: 'PATCH', body: {
  data: {type: 'appStoreVersions', id: 'version', attributes: {releaseType: 'AFTER_APPROVAL'}}}};
const reviewStates = [['WAITING_FOR_REVIEW', 'WAITING_FOR_REVIEW'], ['IN_REVIEW', 'IN_REVIEW'], ['PENDING_DEVELOPER_RELEASE', 'COMPLETE']];

test('automatic changes only the exact reviewed version release type and verifies unchanged scope', async () => {
  for (const [targetState, submissionState] of reviewStates) {
    const result = await execute(automaticFixture({targetState, submissionState, itemState: 'APPROVED'}), automatic);
    assert.equal(result.exitCode, 0, result.errors.join('\n'));
    assert.deepEqual(writes(result), [automaticPatch]);
    assert.deepEqual(result.output.automaticAction, {versionId: 'version', buildId: 'target',
      submissionId: 'submission', releaseType: 'AFTER_APPROVAL', changed: true});
    assert.equal(result.output.versions.find(v => v.id === 'version').releaseType, 'AFTER_APPROVAL');
    assert.equal(result.output.attachedBuild.id, 'target');
    assert.equal(result.output.submissions[0].submittedDate, '2001-01-01T00:00:00Z');
    const calls = result.state.calls, index = calls.findIndex(call => call.method !== 'GET');
    for (const endpoint of ['/v1/appStoreVersions/version', '/v1/appStoreVersions/version/relationships/build',
      '/v1/reviewSubmissions/submission', '/v1/reviewSubmissions/submission/items?include=appStoreVersion&limit=50']) {
      assert.ok(calls.slice(0, index).some(call => call.endpoint === endpoint), 'fresh pre-write read: ' + endpoint);
      assert.ok(calls.slice(index + 1).some(call => call.endpoint === endpoint), 'verified post-write read: ' + endpoint);
    }
  }
});
test('automatic requires exact version/build confirmation and valid app/build identity', async () => {
  for (const confirmation of [null, 'wrong', `${release.version}/${release.iosBuild + 1}`])
    await rejected(automaticFixture(), {...automatic, env: {PM_CONFIRM_REVIEW_VERSION: confirmation}});
  for (const change of [{bundle: 'other.app'}, {targetVersion: release.version + '-other'},
    {buildVersion: release.version + '-other'}, {buildNumber: String(release.iosBuild + 1)},
    {buildCount: 0}, {buildCount: 2}, {processing: 'INVALID'}, {encryption: null}, {encryption: true}])
    await rejected(automaticFixture(change), automatic);
});
test('automatic refuses wrong attachment, ambiguous or unrelated submissions, and unapproved completed scope', async () => {
  for (const change of [{attached: 'old'}, {attached: null}, {submissionCount: 0}, {submissionCount: 2},
    {itemCount: 0}, {itemCount: 2}, {itemVersion: 'another-version'}, {releaseType: 'SCHEDULED'},
    {targetState: 'READY_FOR_SALE'}, {targetState: 'PREPARE_FOR_SUBMISSION'},
    {submissionState: 'READY_FOR_REVIEW'}, {submissionState: 'UNRESOLVED_ISSUES'},
    {targetState: 'PENDING_DEVELOPER_RELEASE', submissionState: 'COMPLETE', itemState: 'REJECTED'}])
    await rejected(automaticFixture(change), automatic);
});
test('automatic detects version, state and release setting races on the fresh version read', async () => {
  for (const change of [{versionId: 'another-version'}, {targetVersion: release.version + '-other'},
    {targetState: 'READY_FOR_SALE'}, {targetState: 'IN_REVIEW'}, {releaseType: 'SCHEDULED'}]) {
    await rejected(automaticFixture({onRead(state, endpoint) {
      if (endpoint === '/v1/appStoreVersions/version') Object.assign(state, change);
    }}), automatic);
  }
});
test('automatic detects fresh submission identity, state, date and scope changes before any write', async () => {
  for (const change of [{singleSubmissionId: 'another-submission'}, {submissionState: 'COMPLETE'},
    {submissionState: 'IN_REVIEW'}, {submittedDate: '2001-01-02T00:00:00Z'}, {itemCount: 2},
    {itemVersion: 'another-version'}, {attached: 'old'}]) {
    await rejected(automaticFixture({onRead(state, endpoint) {
      if (endpoint === '/v1/reviewSubmissions/submission') Object.assign(state, change);
    }}), automatic);
  }
});
test('automatic rejects attachment and scope races introduced by their fresh read', async () => {
  for (const race of [
    {endpoint: '/v1/appStoreVersions/version/relationships/build', change: {attached: 'old'}},
    {endpoint: '/v1/reviewSubmissions/submission/items?include=appStoreVersion&limit=50', change: {itemCount: 2}},
    {endpoint: '/v1/reviewSubmissions/submission/items?include=appStoreVersion&limit=50', change: {itemVersion: 'another-version'}},
  ]) {
    await rejected(automaticFixture({onRead(state, endpoint, count) {
      if (endpoint === race.endpoint && (!endpoint.includes('/items?') || count > 1)) Object.assign(state, race.change);
    }}), automatic);
  }
});
test('automatic fails verification if Apple readback drifts instead of reporting configuration success', async () => {
  for (const change of [{releaseType: 'MANUAL'}, {attached: 'old'}, {singleSubmissionId: 'another-submission'},
    {submissionState: 'IN_REVIEW'}, {submittedDate: '2001-01-02T00:00:00Z'}, {itemCount: 2},
    {itemVersion: 'another-version'}, {targetState: 'READY_FOR_SALE'}, {targetVersion: release.version + '-other'}]) {
    const result = await execute(automaticFixture({afterAutomaticPatch: state => Object.assign(state, change)}), automatic);
    assert.equal(result.exitCode, 1, 'readback drift must not be reported as verified');
    assert.deepEqual(writes(result), [automaticPatch], 'verification failure must not trigger cancellation or other writes');
    assert.equal(result.output, null);
  }
});
test('automatic already configured remains idempotent with verified target and submission', async () => {
  for (const [targetState, submissionState] of reviewStates) {
    const result = await execute(automaticFixture({targetState, submissionState, itemState: 'APPROVED', releaseType: 'AFTER_APPROVAL'}), automatic);
    assert.equal(result.exitCode, 0, result.errors.join('\n'));
    assert.equal(writes(result).length, 0);
    assert.equal(result.output.automaticAction.changed, false);
    assert.equal(result.output.attachedBuild.id, 'target');
  }
});
test('future prepare defaults both newly created and existing editable versions to automatic release', async () => {
  for (const targetMissing of [false, true]) {
    const result = await execute(automaticFixture({targetMissing, targetState: 'PREPARE_FOR_SUBMISSION',
      submissionCount: 0, allowPrepare: true}), {mode: 'prepare'});
    assert.equal(result.exitCode, 0, result.errors.join('\n'));
    assert.equal(result.output.versions.find(v => v.id === 'version').releaseType, 'AFTER_APPROVAL');
    const setup = writes(result).find(call => call.endpoint === (targetMissing ? '/v1/appStoreVersions' : '/v1/appStoreVersions/version'));
    assert.equal(setup.body.data.attributes.releaseType, 'AFTER_APPROVAL');
    assert.equal(result.output.attachedBuild.id, 'target');
  }
});
