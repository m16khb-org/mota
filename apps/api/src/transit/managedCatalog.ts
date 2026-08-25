import { errorDetail, UpstreamError } from "../upstream/upstreamError";

export interface CatalogStatus {
  readonly ready: boolean;
  readonly count: number;
  readonly updatedAt: string | null;
  readonly lastErrorAt: string | null;
  readonly nextRefreshAt: string | null;
}

export interface CatalogEvent {
  readonly source: string;
  readonly trigger: string;
  readonly outcome: "success" | "failure";
  readonly durationMs: number;
  readonly itemCount: number;
  readonly nextRefreshAt: string;
  readonly detail: string | null;
}

interface Snapshot<T> {
  readonly items: readonly T[];
  readonly updatedAt: number;
}

interface ManagedCatalogOptions<T> {
  readonly source: string;
  readonly loader: () => Promise<readonly T[]>;
  readonly now: () => number;
  readonly random: () => number;
  readonly refreshMs: number;
  readonly retryMs: number;
  readonly minimumItems: number;
  readonly schedule: boolean;
  readonly onEvent: (event: CatalogEvent) => void;
}

/** One atomically swapped catalog with single-flight loading, stale fallback,
 * proactive refresh scheduling, jitter, and bounded retry backoff. */
export class ManagedCatalog<T> {
  private snapshot: Snapshot<T> | null = null;
  private inFlight: Promise<Snapshot<T>> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryAfter = 0;
  private lastError: unknown = null;
  private lastErrorAt: number | null = null;
  private nextRefreshAt: number | null = null;

  constructor(private readonly options: ManagedCatalogOptions<T>) {}

  start() {
    if (!this.options.schedule) {
      return;
    }
    void this.refresh("warmup").catch(() => undefined);
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextRefreshAt = null;
  }

  async read(): Promise<readonly T[]> {
    if (!this.snapshot) {
      if (this.lastError && this.options.now() < this.retryAfter) {
        throw this.lastError;
      }
      return (await this.refresh("cold-request")).items;
    }
    if (
      this.options.now() - this.snapshot.updatedAt >=
        this.options.refreshMs &&
      !this.inFlight &&
      this.options.now() >= this.retryAfter
    ) {
      void this.refresh("stale-request").catch(() => undefined);
    }
    return this.snapshot.items;
  }

  async refreshIfDue(trigger = "scheduled"): Promise<boolean> {
    if (
      this.snapshot &&
      this.options.now() - this.snapshot.updatedAt < this.options.refreshMs
    ) {
      return false;
    }
    if (this.options.now() < this.retryAfter) {
      return false;
    }
    await this.refresh(trigger);
    return true;
  }

  async refreshNow(trigger = "manual"): Promise<void> {
    await this.refresh(trigger);
  }

  status(): CatalogStatus {
    return {
      ready: this.snapshot !== null,
      count: this.snapshot?.items.length ?? 0,
      updatedAt: toIso(this.snapshot?.updatedAt ?? null),
      lastErrorAt: toIso(this.lastErrorAt),
      nextRefreshAt: toIso(this.nextRefreshAt),
    };
  }

  private refresh(trigger: string): Promise<Snapshot<T>> {
    this.inFlight ??= this.load(trigger).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async load(trigger: string): Promise<Snapshot<T>> {
    const startedAt = performance.now();
    try {
      const items = await this.options.loader();
      if (items.length < this.options.minimumItems) {
        throw new UpstreamError(
          `${this.options.source} catalog rejected`,
          `${this.options.source} catalog contained ${items.length} items`,
        );
      }
      const snapshot = { items, updatedAt: this.options.now() };
      this.snapshot = snapshot;
      this.retryAfter = 0;
      this.lastError = null;
      this.schedule(this.jitteredRefreshDelay());
      this.options.onEvent({
        source: this.options.source,
        trigger,
        outcome: "success",
        durationMs: Math.round(performance.now() - startedAt),
        itemCount: items.length,
        nextRefreshAt: toIso(this.nextRefreshAt) ?? "",
        detail: null,
      });
      return snapshot;
    } catch (error) {
      this.lastError = error;
      this.lastErrorAt = this.options.now();
      this.retryAfter = this.options.now() + this.options.retryMs;
      this.schedule(this.options.retryMs);
      this.options.onEvent({
        source: this.options.source,
        trigger,
        outcome: "failure",
        durationMs: Math.round(performance.now() - startedAt),
        itemCount: this.snapshot?.items.length ?? 0,
        nextRefreshAt: toIso(this.nextRefreshAt) ?? "",
        detail: errorDetail(error),
      });
      throw error;
    }
  }

  private jitteredRefreshDelay() {
    return Math.round(
      this.options.refreshMs * (1 + this.options.random() * 0.1),
    );
  }

  private schedule(delayMs: number) {
    if (!this.options.schedule) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.nextRefreshAt = this.options.now() + delayMs;
    this.timer = setTimeout(() => {
      void this.refreshIfDue().catch(() => undefined);
    }, delayMs);
    this.timer.unref();
  }
}

function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}
