/**
 * STORE-PR6 §8/§11/§14 — pure handoff orchestration: parse → dedup (single-flight) → redeem once →
 * establish the PR5 federated session → validate the returned target.
 *
 * No React, no Capacitor, no navigation here — that lives in StoreDeepLinkCoordinator. This class holds
 * ONLY an in-memory fingerprint of handled handoffs (never the raw code/state) so overlapping cold+warm
 * events can never double-redeem. The backend remains the authoritative one-time-use control.
 */
import type { FederatedRedeemResult } from "@/lib/auth/session/app-session.types";
import { handoffFingerprint, parseHandoffOpenUrl } from "./store-open-url";
import { validateTarget } from "./store-target";
import { redeemHandoff, type RedeemOutcome } from "./customer-handoff-redeem-api";
import type { HandoffParams, HandoffUxState, RedeemDevice } from "./store-deep-link.types";

export type HandoffResult =
  // §2 — `customerId` is the verified Store customer id from the redeem; the readiness bridge binds to it so
  // a stale `authenticated_ready` from a PREVIOUS identity can never satisfy this handoff.
  // §9.3 — customerId ALONE cannot identify a handoff: the same customer can redeem a new session
  // family, which is a new identity context that must be revalidated. The epoch pairs with it so
  // readiness can require the CURRENT context, not merely the right person.
  | { state: "success"; target: string; customerId: string; identityEpoch: number }
  | { state: Exclude<HandoffUxState, "success" | "processing"> };

export type StoreHandoffDeps = {
  parse?: (url: unknown) => ReturnType<typeof parseHandoffOpenUrl>;
  redeem?: (params: HandoffParams, device: RedeemDevice) => Promise<RedeemOutcome>;
  /**
   * §9.3 — an authenticated establish MUST report the identity epoch it created. Readiness is bound to
   * that epoch, so a missing one cannot be defaulted: `?? 0` would manufacture a plausible-looking
   * epoch and let the handoff be declared ready against the wrong identity context.
   *
   * Required, and required to return the epoch. The optional-with-a-no-op-default version left the
   * contract enforceable only at runtime: a caller that forgot to wire it compiled cleanly and failed as
   * an unexplained "unavailable" handoff. Making it a compile-time obligation moves that from a support
   * ticket to a build error.
   */
  establishSession: (result: FederatedRedeemResult) => Promise<{ identityEpoch: number }>;
  getDevice: () => Promise<RedeemDevice>;
  validateTargetFn?: (t: unknown) => string;
  fingerprint?: (params: HandoffParams) => Promise<string>;
};

const ERROR_STATE: Record<string, Exclude<HandoffUxState, "success" | "processing">> = {
  HANDOFF_EXPIRED: "expired",
  HANDOFF_ALREADY_REDEEMED: "already_used",
  HANDOFF_STATE_MISMATCH: "invalid",
  HANDOFF_INVALID: "invalid",
  STORE_INTEGRATION_DISABLED: "unavailable",
  // The federated session service is off / not configured. Definitive for this attempt — "try again later",
  // never the generic retry copy that implies the link itself is fine.
  FEDERATED_AUTH_DISABLED: "unavailable",
  IDENTITY_BLOCKED: "blocked",
  // The identity needs an extra verification step before it can be linked; the customer can still browse.
  IDENTITY_LINK_REQUIRED: "identity_verification_required",
  HANDOFF_RATE_LIMITED: "retryable_error",
  STORE_UNAVAILABLE: "unavailable",
  UNKNOWN: "retryable_error",
};

export class StoreHandoffController {
  private readonly inflight = new Map<string, Promise<HandoffResult>>();
  private readonly consumed = new Set<string>();
  private readonly deps: Required<StoreHandoffDeps>;

  constructor(deps: StoreHandoffDeps) {
    this.deps = {
      parse: deps.parse ?? parseHandoffOpenUrl,
      redeem: deps.redeem ?? ((p, d) => redeemHandoff(p, d)),
      establishSession: deps.establishSession,
      validateTargetFn: deps.validateTargetFn ?? validateTarget,
      fingerprint: deps.fingerprint ?? handoffFingerprint,
      getDevice: deps.getDevice,
    };
  }

  /**
   * Handle a raw incoming /open URL. Concurrent calls for the SAME (code,state) coalesce into ONE redeem;
   * a handoff that already reached a definitive outcome returns `already_used` without touching the network.
   */
  handle(rawUrl: unknown): Promise<HandoffResult> {
    const parsed = this.deps.parse(rawUrl); // native: strict host + path + params
    if (!parsed.ok) return Promise.resolve({ state: "invalid" });
    return this.dispatch(parsed.params);
  }

  /** WEB path — the /open page already validated same-origin params (parseHandoffQuery); dedup/redeem here. */
  handleParams(params: HandoffParams): Promise<HandoffResult> {
    return this.dispatch(params);
  }

  private async dispatch(params: HandoffParams): Promise<HandoffResult> {
    // SHA-256 fingerprint is async; the check+set below runs synchronously AFTER the await, so two concurrent
    // dispatches for the same handoff still coalesce (the second sees the first's inflight entry).
    // §5 — if Web Crypto SHA-256 is unavailable the fingerprint throws; fail closed (never redeem on a
    // collision-prone digest). Raw code/state are never logged here.
    let fp: string;
    try {
      fp = await this.deps.fingerprint(params);
    } catch {
      return { state: "unavailable" };
    }
    if (this.consumed.has(fp)) return { state: "already_used" };
    const existing = this.inflight.get(fp);
    if (existing) return existing;

    const promise = this.run(params, fp).finally(() => {
      this.inflight.delete(fp);
    });
    this.inflight.set(fp, promise);
    return promise;
  }

  private async run(params: HandoffParams, fp: string): Promise<HandoffResult> {
    const device = await this.deps.getDevice();
    const outcome = await this.deps.redeem(params, device);

    if (outcome.kind === "authenticated") {
      // The one-time code is now spent backend-side → consume regardless of what happens next.
      this.consumed.add(fp);
      const customerId = outcome.result.customer.id; // §2 — verified Store customer id for identity-bound readiness
      let established: { identityEpoch: number } | undefined;
      try {
        established = await this.deps.establishSession(outcome.result); // PR5-owned; may throw storage_error
      } catch {
        return { state: "unavailable" };
      }
      const identityEpoch = established?.identityEpoch;
      // Kept as defence in depth even though the type now guarantees it: this value decides whether a
      // handoff may be declared ready, and an untyped caller must still fail closed rather than sneak a
      // NaN or undefined through.
      if (typeof identityEpoch !== "number" || !Number.isFinite(identityEpoch)) {
        // Fail closed: without the epoch this handoff cannot prove readiness belongs to it.
        return { state: "unavailable" };
      }
      return {
        state: "success",
        target: this.deps.validateTargetFn(outcome.result.target),
        customerId,
        identityEpoch,
      };
    }

    if (outcome.kind === "identity_link_required") {
      this.consumed.add(fp);
      return { state: "identity_verification_required" };
    }

    // error — only mark consumed when a retry of the same code cannot help (§14).
    if (!outcome.retryable) this.consumed.add(fp);
    return { state: ERROR_STATE[outcome.code] ?? "retryable_error" };
  }
}
