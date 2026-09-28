(function (global) {
  'use strict';
  const KEY = 'pm-privacy-epoch';
  const HEADER = 'x-promotors-data-epoch';
  const EVENT = 'pm-privacy-epoch-change';
  let acceptedEpoch = null, observedEpoch = 0, ready = false, revision = 0;
  let queue = Promise.resolve();
  const valid = value => Number.isSafeInteger(value) && value >= 0;
  function fail(code) { const error = new Error(code); error.code = code; return error; }
  function storedEpoch() {
    try {
      const raw = localStorage.getItem(KEY);
      const value = raw === null ? 0 : Number(raw);
      return valid(value) ? value : 0;
    } catch { return 0; }
  }
  observedEpoch = storedEpoch();
  let channel;
  try { if ('BroadcastChannel' in global) channel = new global.BroadcastChannel(KEY); } catch {}
  function invalidate(epoch, source) {
    ready = false;
    revision += 1;
    global.dispatchEvent(new CustomEvent(EVENT, { detail: Object.freeze({ epoch, previousEpoch: acceptedEpoch, source, revision }) }));
  }
  function persist(epoch) {
    try { localStorage.setItem(KEY, String(epoch)); } catch {}
  }
  function observe(value, source) {
    if (!valid(value) || value <= observedEpoch) return;
    observedEpoch = value;
    persist(value);
    invalidate(value, source);
  }
  if (channel) channel.addEventListener('message', event => observe(event.data?.epoch, 'broadcast'));
  global.addEventListener('storage', event => {
    if (event.key === KEY && event.newValue !== null) observe(Number(event.newValue), 'storage');
  });
  function headers() {
    const latest = storedEpoch();
    if (latest > observedEpoch) observe(latest, 'storage');
    if (!ready || acceptedEpoch === null || acceptedEpoch !== observedEpoch) throw fail('PRIVACY_EPOCH_NOT_READY');
    return Object.freeze({ [HEADER]: String(acceptedEpoch) });
  }
  async function acceptFresh(rows, resetPrivateCache) {
    if (!Array.isArray(rows)) throw fail('INVALID_SYNC_RESPONSE');
    const epochRows = rows.filter(row => row?.data_key === KEY);
    const epoch = epochRows[0]?.payload?.epoch;
    if (epochRows.length !== 1 || !valid(epoch)) throw fail('PRIVACY_EPOCH_MISSING');
    observedEpoch = Math.max(observedEpoch, storedEpoch());
    if (epoch < observedEpoch) throw fail('PRIVACY_EPOCH_STALE_RESPONSE');
    const freshRows = rows.filter(row => row?.data_key !== KEY);
    const changed = acceptedEpoch === null || epoch !== acceptedEpoch || !ready;
    if (!changed) return Object.freeze({ rows: freshRows, epoch, changed: false });
    if (typeof resetPrivateCache !== 'function') throw fail('PRIVACY_CACHE_RESET_REQUIRED');
    const publish = epoch > observedEpoch;
    observedEpoch = epoch;
    persist(epoch);
    invalidate(epoch, 'accept');
    if (publish) channel?.postMessage({ epoch });
    const startRevision = revision;
    // The callback must clear dirty/private caches AND apply these fresh rows before resolving.
    // Writes remain blocked for the complete callback, including asynchronous cache resets.
    await resetPrivateCache(Object.freeze({ rows: freshRows, epoch }));
    if (revision !== startRevision || observedEpoch !== epoch || storedEpoch() > epoch) {
      ready = false;
      throw fail('PRIVACY_EPOCH_CHANGED_DURING_HYDRATE');
    }
    acceptedEpoch = epoch;
    ready = true;
    return Object.freeze({ rows: freshRows, epoch, changed: true });
  }
  function accept(rows, { resetPrivateCache } = {}) {
    const operation = queue.catch(() => {}).then(() => acceptFresh(rows, resetPrivateCache));
    queue = operation;
    return operation;
  }
  function reset() {
    // Logout does not change the server epoch or advertise a new generation to other tabs.
    invalidate(observedEpoch, 'reset');
  }
  global.PMPrivacyEpoch = Object.freeze({ headers, accept, reset });
})(window);
