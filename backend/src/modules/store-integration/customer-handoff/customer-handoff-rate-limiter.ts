/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — In-memory sliding-window rate limiter + IP resolver.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §16.5 + hardening B7.
 *
 * Per-instance safeguard. Keys are HASHED (bounded length, no raw device id/IP retained), expired
 * entries are swept automatically, and the map is HARD-CAPPED so attacker-supplied unique keys cannot
 * grow memory without bound. A rate-limit rejection NEVER consumes a handoff (callers check before any
 * DB consume). Per-instance only (like the app ThrottlerModule) — a shared limiter (Redis) is the
 * horizontal-scale prerequisite before production activation; documented, not silent.
 */
import { createHash } from "crypto";

export class SlidingWindowRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 50_000,
  ) {}

  private hashKey(raw: string): string {
    // Bound the key and never store the raw device id / IP.
    return createHash("sha256").update(String(raw).slice(0, 256), "utf8").digest("base64url").slice(0, 32);
  }

  /** Records an attempt for `rawKey`; returns true if within the limit. */
  allow(rawKey: string, now: number = Date.now()): boolean {
    const key = this.hashKey(rawKey);
    const cutoff = now - this.windowMs;
    const existing = this.hits.get(key);

    // Enforce the cap BEFORE inserting a NEW key so size never exceeds maxKeys (task C4). An already-tracked
    // key is only updated (never evicted here), so a key at capacity is not unnecessarily dropped.
    if (existing === undefined && this.hits.size >= this.maxKeys) {
      this.sweep(now);
      while (this.hits.size >= this.maxKeys) {
        const oldest = this.hits.keys().next().value;
        if (oldest === undefined) break;
        this.hits.delete(oldest);
      }
    }

    const arr = (existing ?? []).filter((t) => t > cutoff);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }

  /** Removes entries whose timestamps have all expired. */
  sweep(now: number = Date.now()): void {
    const cutoff = now - this.windowMs;
    for (const [key, arr] of this.hits) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }

  /** Test/inspection helper. */
  get size(): number {
    return this.hits.size;
  }
}

interface IpReq {
  socket?: { remoteAddress?: string };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Resolves the client IP for rate-limiting with an EXPLICIT trusted-proxy hop count (B6). We never blindly
 * trust an arbitrary X-Forwarded-For:
 *   * `trustedHops = 0` → ignore XFF entirely, use the socket peer address.
 *   * `trustedHops = n` → treat the rightmost n entries of `[...XFF, socketPeer]` as trusted proxies and
 *     return the entry immediately to their left (the real client). A spoofed left-padding is discarded.
 * This matches Express `trust proxy = <n>` semantics and is independently testable.
 */
export function resolveClientIp(req: IpReq | undefined, trustedHops = 0): string {
  const socket = (req?.socket?.remoteAddress ?? req?.ip ?? "unknown").trim() || "unknown";
  const hops = Number.isInteger(trustedHops) && trustedHops > 0 ? trustedHops : 0;
  if (hops === 0) return socket.slice(0, 64);

  const rawXff = req?.headers?.["x-forwarded-for"];
  const xff = (Array.isArray(rawXff) ? rawXff.join(",") : rawXff ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = [...xff, socket]; // rightmost is the direct socket peer
  const idx = chain.length - 1 - hops;
  const client = idx >= 0 ? chain[idx] : socket;
  return (client || "unknown").slice(0, 64);
}
