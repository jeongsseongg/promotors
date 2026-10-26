import {createActivityTokenQueue, type ActivityTokenContext, type ActivityTokenEvent} from './activity-tokens';
import type {ActivityTokenSnapshot} from './push';

export interface OngoingStatus {supported: boolean; enabled: boolean; connected: boolean}
interface Options {
  context(): ActivityTokenContext;
  read(): Promise<ActivityTokenSnapshot>;
  register(event: ActivityTokenEvent): Promise<unknown>;
}
/** A native snapshot repairs missed emitter events; server acknowledgement defines connected. */
export function createActivitySync(options: Options) {
  const queue = createActivityTokenQueue(options);
  let last: {context: ActivityTokenContext; snapshot: ActivityTokenSnapshot} | null = null;
  let refreshing: Promise<void> | null = null, disposed = false;
  const same = (a: ActivityTokenContext, b: ActivityTokenContext) =>
    a.owner === b.owner && a.binding === b.binding && a.generation === b.generation;
  async function read() {
    const captured = options.context();
    if (!captured.owner || !captured.binding) {last = null; queue.reconcile(); return;}
    try {
      const snapshot = await options.read();
      if (disposed || !same(captured, options.context())) return;
      last = {context: captured, snapshot};
      if (!snapshot.enabled) {queue.clear(); return;}
      for (const event of snapshot.tokens) queue.offer(event);
      await queue.flush();
    } catch {last = null; await queue.flush();}
  }
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (refreshing) return refreshing;
    const next = read().finally(() => {if (refreshing === next) refreshing = null;});
    refreshing = next; return next;
  }
  function status(): OngoingStatus | undefined {
    const current = options.context();
    if (!last || !same(last.context, current)) return undefined;
    const {supported, enabled, tokens} = last.snapshot;
    return {supported, enabled, connected: enabled && tokens.some(event => queue.registered(event))};
  }
  return {refresh, status, offer: queue.offer, reconcile: queue.reconcile,
    clear() {last = null; queue.clear();}, dispose() {disposed = true; last = null; queue.dispose();}};
}
