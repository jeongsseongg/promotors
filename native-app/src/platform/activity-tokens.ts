export interface ActivityTokenEvent {binding: string; kind: 'start' | 'update'; token: string}
export interface ActivityTokenContext {owner: string | null; binding: string | null; generation: number}
interface Options {
  context(): ActivityTokenContext;
  register(event: ActivityTokenEvent): Promise<unknown>;
}
interface Entry {event: ActivityTokenEvent}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Only RAM is used: an account or native connection change discards every token. */
class ActivityTokenQueue {
  private pending = new Map<ActivityTokenEvent['kind'], Entry>();
  private acknowledged = new Map<ActivityTokenEvent['kind'], ActivityTokenEvent>();
  private context: ActivityTokenContext;
  private queuedBinding: string | null = null;
  private epoch = 0;
  private failures = 0;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  constructor(private options: Options) {this.context = options.context();}
  private cancelRetry() {if (this.timer !== null) {clearTimeout(this.timer); this.timer = null;}}
  clear = () => {
    this.epoch++; this.pending.clear(); this.acknowledged.clear(); this.queuedBinding = null; this.failures = 0; this.cancelRetry();
  };
  reconcile = () => {
    const next = this.options.context();
    if (!next.owner || next.owner !== this.context.owner || next.generation !== this.context.generation) this.clear();
    this.context = next;
    return next;
  };
  private retry() {
    if (this.disposed || this.timer !== null || !this.pending.size) return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.failures, 5));
    this.timer = setTimeout(() => {this.timer = null; void this.flush();}, delay);
  }
  private async drain() {
    const captured = this.epoch;
    for (const entry of [...this.pending.values()]) {
      const current = this.reconcile();
      if (this.disposed || captured !== this.epoch || !current.owner || current.binding !== entry.event.binding) return;
      if (this.pending.get(entry.event.kind) !== entry) continue;
      try {
        // The service must still validate its own binding, account and revision.
        await this.options.register(entry.event);
        this.reconcile();
        if (this.disposed || captured !== this.epoch) return;
        this.acknowledged.set(entry.event.kind, entry.event);
        if (this.pending.get(entry.event.kind) === entry) this.pending.delete(entry.event.kind);
      } catch {
        this.reconcile();
        if (this.disposed || captured !== this.epoch) return;
        this.failures++;
      }
    }
    if (!this.pending.size) this.failures = 0;
  }
  flush = (): Promise<void> => {
    if (this.disposed) return Promise.resolve();
    this.reconcile();
    if (this.running) return this.running.then(() => this.flush());
    this.cancelRetry();
    if (!this.context.owner || !this.pending.size) return Promise.resolve();
    const work = this.drain().finally(() => {
      if (this.running === work) this.running = null;
      this.retry();
    });
    this.running = work;
    return work;
  };
  offer = (event: ActivityTokenEvent) => {
    const current = this.reconcile();
    if (this.disposed || !current.owner || !uuid.test(event.binding) || !['start', 'update'].includes(event.kind) ||
      !/^[a-f0-9]{64,256}$/.test(event.token)) return false;
    if (this.queuedBinding !== event.binding) {this.clear(); this.queuedBinding = event.binding;}
    if (this.registered(event)) return true;
    const previous = this.pending.get(event.kind)?.event;
    if (previous?.binding === event.binding && previous.token === event.token) return true;
    this.pending.set(event.kind, {event: {...event}}); this.failures = 0;
    void this.flush();
    return true;
  };
  dispose = () => {this.disposed = true; this.clear();};
  registered = (event: ActivityTokenEvent) => {
    this.reconcile();
    const value = this.acknowledged.get(event.kind);
    return value?.binding === event.binding && value.token === event.token;
  };
}
export function createActivityTokenQueue(options: Options) {return new ActivityTokenQueue(options);}
