export interface ActivityTokenEvent {binding: string; kind: 'start' | 'update'; token: string}
export interface ActivityTokenContext {owner: string | null; binding: string | null; generation: number}
interface Options {
  context(): ActivityTokenContext;
  register(event: ActivityTokenEvent): Promise<unknown>;
}
interface Entry {event: ActivityTokenEvent}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Only RAM is used: an account or native connection change discards every token. */
export function createActivityTokenQueue(options: Options) {
  const pending = new Map<ActivityTokenEvent['kind'], Entry>();
  const acknowledged = new Map<ActivityTokenEvent['kind'], ActivityTokenEvent>();
  let context = options.context(), queuedBinding: string | null = null, epoch = 0, failures = 0;
  let running: Promise<void> | null = null, timer: ReturnType<typeof setTimeout> | null = null, disposed = false;
  function cancelRetry() {if (timer !== null) {clearTimeout(timer); timer = null;}}
  function clear() {epoch++; pending.clear(); acknowledged.clear(); queuedBinding = null; failures = 0; cancelRetry();}
  function reconcile() {
    const next = options.context();
    if (!next.owner || next.owner !== context.owner || next.generation !== context.generation) clear();
    context = next;
    return next;
  }
  function retry() {
    if (disposed || timer !== null || !pending.size) return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(failures, 5));
    timer = setTimeout(() => {timer = null; void flush();}, delay);
  }
  async function drain() {
    const captured = epoch;
    for (const entry of [...pending.values()]) {
      const current = reconcile();
      if (disposed || captured !== epoch || !current.owner || current.binding !== entry.event.binding) return;
      if (pending.get(entry.event.kind) !== entry) continue;
      try {
        // The service must still validate its own binding, account and revision.
        await options.register(entry.event);
        reconcile();
        if (disposed || captured !== epoch) return;
        acknowledged.set(entry.event.kind, entry.event);
        if (pending.get(entry.event.kind) === entry) pending.delete(entry.event.kind);
      } catch {
        reconcile();
        if (disposed || captured !== epoch) return;
        failures++;
      }
    }
    if (!pending.size) failures = 0;
  }
  function flush(): Promise<void> {
    if (disposed) return Promise.resolve();
    reconcile();
    if (running) return running.then(() => flush());
    cancelRetry();
    if (!context.owner || !pending.size) return Promise.resolve();
    const work = drain().finally(() => {
      if (running === work) running = null;
      retry();
    });
    running = work;
    return work;
  }
  function offer(event: ActivityTokenEvent) {
    const current = reconcile();
    if (disposed || !current.owner || !uuid.test(event.binding) || !['start', 'update'].includes(event.kind) ||
      !/^[a-f0-9]{64,256}$/.test(event.token)) return false;
    if (queuedBinding !== event.binding) {clear(); queuedBinding = event.binding;}
    if (registered(event)) return true;
    const previous = pending.get(event.kind)?.event;
    if (previous?.binding === event.binding && previous.token === event.token) return true;
    pending.set(event.kind, {event: {...event}}); failures = 0;
    void flush();
    return true;
  }
  function dispose() {disposed = true; clear();}
  function registered(event: ActivityTokenEvent) {
    reconcile();
    const value = acknowledged.get(event.kind);
    return value?.binding === event.binding && value.token === event.token;
  }
  return {offer, flush, reconcile, clear, dispose, registered};
}
