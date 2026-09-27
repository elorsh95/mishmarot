/**
 * In-memory limits for public endpoints (per server instance). App Hosting runs at most a
 * couple of instances, so these bound the total well enough without a shared store.
 */

/** At most `max` hits per key in any `windowMs`. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    /** Keys tracked at once; the oldest are dropped beyond this, so memory stays bounded. */
    private readonly maxKeys = 5000,
  ) {}

  /** Records a hit and returns whether it is within the limit. */
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.delete(key); // re-insert: Map order is insertion order, oldest first
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value!);
    return true;
  }
}

/** Remembers keys for `ttlMs`, to drop repeats of the same thing. */
export class SeenRecently {
  private seen = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxKeys = 5000,
  ) {}

  /** True if the key was seen within the last ttl; records it either way. */
  check(key: string, now = Date.now()): boolean {
    const at = this.seen.get(key);
    const repeat = at !== undefined && now - at < this.ttlMs;
    if (!repeat) {
      this.seen.delete(key);
      this.seen.set(key, now);
      if (this.seen.size > this.maxKeys) this.seen.delete(this.seen.keys().next().value!);
    }
    return repeat;
  }
}
