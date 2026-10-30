const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').replace(/\r\n/g, '\n');
const key = 'service-synthetic-private';
const image = {type: 'image/webp', marker: 'synthetic image'};
function fn(name) {
  const found = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}\\n`));
  assert.ok(found, `Missing source function ${name}`); return found[0];
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function storage() {
  const values = new Map();
  return {getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value),
    removeItem: name => values.delete(name)};
}
function setup() {
  const calls = [], files = new Map(), created = [], revoked = [];
  const state = {authToken: 'synthetic-owner', assetScopeVersion: 0, authScopeCleanup: Promise.resolve(),
    hydratedAuthScope: '', remoteAssets: {}, objectUrls: new Map(), remoteState: {},
    locallyModifiedKeys: new Set(), canonicalMembers: [], canonicalMembersRefreshedAt: 0,
    canonicalMembersRefresh: null, promoState: {}, promoLoaded: false,
    SUPABASE_DATA_KEYS: ['pm-bookings', 'pm-service-runs', 'pm-members', 'pm-notices'],
    SUPABASE_PUBLIC_DATA_KEYS: new Set(['pm-notices']), localStorage: storage(),
    SUPABASE_PUBLIC_ASSET_BUCKET: 'promotors-public', SUPABASE_PRIVATE_ASSET_BUCKET: 'promotors-private',
    PUBLIC_ASSET_KEY: /^(branch|notice|case|intro|event)-/,
    getSupabaseConfig: () => ({url: 'https://synthetic.invalid', anon: 'synthetic-public-key'}),
    assetDb: {get: async name => files.get(name) || null, set: async (name, value) => {files.set(name, value);}},
    privacyClearAssets: async () => {files.clear();}, privacyReload() {throw new Error('Unexpected privacy reload');},
    imageFileToOptimizedBlob: async value => value,
    URL: {createObjectURL: value => {const url = `blob:synthetic-${created.length}`; created.push({url, value}); return url;},
      revokeObjectURL: url => revoked.push(url)},
    fetch: async (url, options) => {calls.push({url, options}); return {ok: true, json: async () => ({
      signedURL: '/object/sign/promotors-private/synthetic?token=synthetic-only'}), blob: async () => image};},
    supabaseRpc: async (name, args) => {calls.push({name, args}); return 'data:image/webp;base64,c3ludGhldGlj';},
    console: {warn() {}}, Date, JSON, Math, window: {PMPrivacyEpoch: {headers: () => ({})}},
  };
  vm.createContext(state);
  vm.runInContext(['captureAssetScope', 'assertAssetScope', 'assetBucket', 'storageHeaders',
    'storageAssetUrl', 'legacyAssetSrc', 'assetSrc', 'privacyClearMemory', 'clearAuthScopeCache',
    'rememberRemoteAsset', 'uploadStorageAsset', 'saveFiles', 'fetchAssetBlob', 'recoverAssetImage'].map(fn).join('\n'), state);
  return {state, calls, files, created, revoked};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const sessionChanged = error => error?.code === 'SESSION_CHANGED';
async function changeScope(state, token = 'synthetic-branch') {
  state.authToken = token; await state.clearAuthScopeCache();
}
function noPrivateCache(context) {
  assert.equal(Object.keys(context.state.remoteAssets).length, 0);
  assert.equal(context.state.objectUrls.size, 0);
  assert.equal(context.created.length, 0);
}

test('a late owner Storage signing response cannot repopulate a branch cache', async () => {
  const context = setup(), waiting = deferred(); let fetches = 0, legacy = 0;
  context.state.fetch = async () => {fetches++; return waiting.promise;};
  context.state.supabaseRpc = async () => {legacy++; return 'synthetic old data';};
  const operation = context.state.assetSrc(key); await tick();
  await changeScope(context.state);
  waiting.resolve({ok: true, json: async () => ({signedURL: '/old-owner-url'})});
  assert.equal(await operation, ''); noPrivateCache(context);
  assert.equal(fetches, 1); assert.equal(legacy, 0);
});

test('a late signing body is rejected after the same token scope changes', async () => {
  const context = setup(), waiting = deferred();
  context.state.fetch = async () => ({ok: true, json: () => waiting.promise});
  const operation = context.state.assetSrc(key); await tick();
  await changeScope(context.state, context.state.authToken);
  waiting.resolve({signedURL: '/old-scope-url'});
  assert.equal(await operation, ''); noPrivateCache(context);
});

test('legacy image completion cannot repopulate the next session cache', async () => {
  const context = setup(), waiting = deferred(); let legacy = 0;
  context.state.fetch = async () => {throw new Error('Synthetic missing Storage object');};
  context.state.supabaseRpc = async () => {legacy++; return waiting.promise;};
  const operation = context.state.assetSrc(key); await tick();
  assert.equal(legacy, 1); await changeScope(context.state);
  waiting.resolve('data:image/webp;base64,c3ludGhldGlj');
  assert.equal(await operation, ''); noPrivateCache(context);
});

test('an IndexedDB read finishing after a scope change creates no stale object URL', async () => {
  const context = setup(), waiting = deferred();
  context.state.assetDb.get = () => waiting.promise;
  const operation = context.state.assetSrc(key); await tick();
  await changeScope(context.state); waiting.resolve(image);
  assert.equal(await operation, ''); noPrivateCache(context);
  assert.equal(context.calls.length, 0);
});

test('private image requests wait for cleanup before reading an old local cache', async () => {
  const context = setup(), waiting = deferred(); let reads = 0;
  context.state.authScopeCleanup = waiting.promise;
  context.state.assetDb.get = async () => {reads++; return image;};
  const operation = context.state.assetSrc(key); await tick();
  assert.equal(reads, 0); context.state.privacyClearMemory(); waiting.resolve();
  assert.equal(await operation, ''); assert.equal(reads, 0); noPrivateCache(context);
});

test('the actual IndexedDB setter refuses to write after its delayed open changes scope', async () => {
  const context = setup(), waiting = deferred(); let transactions = 0, closed = 0;
  const setter = source.match(/  async set\(key, value\) \{[^]*?\n  \},/);
  assert.ok(setter, 'Missing actual assetDb.set implementation');
  context.state.assetDb.open = () => waiting.promise;
  context.state.assetDb.set = vm.runInContext(`({${setter[0]}}).set`, context.state);
  const operation = context.state.assetDb.set(key, image);
  await changeScope(context.state, context.state.authToken);
  waiting.resolve({close() {closed++;}, transaction() {transactions++; throw new Error('Unexpected write');}});
  await assert.rejects(operation, sessionChanged);
  assert.equal(transactions, 0); assert.equal(closed, 1);
});

test('late optimization stops before uploading under the next account', async () => {
  const context = setup(), waiting = deferred();
  context.state.imageFileToOptimizedBlob = () => waiting.promise;
  const operation = context.state.rememberRemoteAsset(key, image); await tick();
  await changeScope(context.state); waiting.resolve(image);
  await assert.rejects(operation, sessionChanged);
  assert.equal(context.calls.length, 0); noPrivateCache(context);
});

test('a late successful upload cannot request a signature or update the next account cache', async () => {
  const context = setup(), waiting = deferred(); let uploads = 0;
  context.state.fetch = async () => {uploads++; return waiting.promise;};
  const operation = context.state.rememberRemoteAsset(key, image); await tick();
  assert.equal(uploads, 1); await changeScope(context.state);
  waiting.resolve({ok: true, json: async () => ({})});
  await assert.rejects(operation, sessionChanged);
  assert.equal(uploads, 1); noPrivateCache(context);
});

test('saveFiles does not publish local keys or begin upload after a delayed local save changes scope', async () => {
  const context = setup(), waiting = deferred(); let published = 0, uploads = 0;
  context.state.assetDb.set = () => waiting.promise;
  context.state.rememberRemoteAsset = async () => {uploads++;};
  const operation = context.state.saveFiles([image], 'service', 1, () => {published++;}); await tick();
  await changeScope(context.state); waiting.resolve();
  await assert.rejects(operation, sessionChanged);
  assert.equal(published, 0); assert.equal(uploads, 0); noPrivateCache(context);
});

test('saveFiles stops if its local-ready callback completes in another scope', async () => {
  const context = setup(), waiting = deferred(); let uploads = 0;
  context.state.rememberRemoteAsset = async () => {uploads++;};
  const operation = context.state.saveFiles([image], 'service', 1, () => waiting.promise); await tick();
  await changeScope(context.state, context.state.authToken); waiting.resolve();
  await assert.rejects(operation, sessionChanged);
  assert.equal(uploads, 0); assert.equal(context.state.objectUrls.size, 0);
});

test('a late downloaded image body is not returned to the next account', async () => {
  const context = setup(), waiting = deferred();
  context.state.remoteAssets[key] = {url: 'https://synthetic.invalid/old-owner-signed'};
  context.state.fetch = async () => ({ok: true, blob: () => waiting.promise});
  const operation = context.state.fetchAssetBlob(key); await tick();
  await changeScope(context.state); waiting.resolve(image);
  await assert.rejects(operation, sessionChanged);
  assert.equal(context.state.objectUrls.size, 0);
});

test('a late fallback cannot attach an old account image to a still-connected element', async () => {
  const context = setup(), waiting = deferred(); let onError;
  context.state.supabaseRpc = () => waiting.promise;
  const element = {dataset: {}, isConnected: true, src: 'unchanged', addEventListener: (_, callback) => {onError = callback;}};
  await context.state.recoverAssetImage(element, key);
  const operation = onError(); await tick(); await changeScope(context.state);
  waiting.resolve('data:image/webp;base64,c3ludGhldGlj'); await operation;
  assert.equal(element.src, 'unchanged');
});

test('an unchanged session can upload and attach its own new local photos normally', async () => {
  const context = setup(); let published = [];
  const keys = await context.state.saveFiles([image], 'service', 1, value => {published = [...value];});
  assert.equal(keys.length, 1); assert.match(keys[0], /^service-/);
  assert.deepEqual([...keys], published); assert.equal(context.files.size, 1);
  assert.equal(context.created.length, 1); assert.equal(context.calls.length, 1);
  assert.equal(context.calls[0].options.headers['x-upsert'], 'false');
  assert.equal(context.calls[0].options.headers['x-promotors-token'], context.state.authToken);
  assert.equal(context.state.remoteAssets[keys[0]].url, context.state.objectUrls.get(keys[0]));
});

test('a new account still loads public images and its newly authorized private images', async () => {
  const context = setup(); await changeScope(context.state);
  assert.match(await context.state.assetSrc('notice-synthetic-public'), /\/object\/public\/promotors-public\//);
  assert.match(await context.state.assetSrc(key), /\/object\/sign\/promotors-private\//);
  assert.equal(context.calls.length, 1);
  assert.equal(context.calls[0].options.headers['x-promotors-token'], 'synthetic-branch');
});
