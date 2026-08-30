// @vitest-environment jsdom
/**
 * STORE-PR6 §2/§3/§4 — the readiness bridge is IDENTITY-BOUND. A stale `authenticated_ready` from a previous
 * identity (Supabase or a previous federated customer) must NEVER satisfy a fresh handoff for customer B;
 * only the fully-verified federated identity for B may resolve `ready`. `authenticated_offline` is a bounded
 * transient outcome, never `ready`.
 */
import { describe, expect, it } from "vitest";
import { render, act } from "@testing-library/react";
import { AuthContext, defaultAuthContextValue, type AuthContextValue } from "@/lib/auth/AuthContext";
import { useAwaitAuthReady, matchesFederatedIdentity, type AuthReadyOutcome } from "./use-handoff-auth-ready";

// The hook returns a STABLE callback; capture it once and drive provider state via rerender.
let awaitReady: ((expectedCustomerId: string, expectedIdentityEpoch: number, timeoutMs?: number) => Promise<AuthReadyOutcome>) | null = null;
function Harness() {
  awaitReady = useAwaitAuthReady();
  return null;
}

function value(partial: Partial<AuthContextValue>): AuthContextValue {
  return { ...defaultAuthContextValue, ...partial };
}
function federatedReady(id: string): Partial<AuthContextValue> {
  return {
    authStatus: "authenticated_ready",
    authSource: "DilMart_federated",
    appSession: { authSource: "DilMart_federated", accessToken: "at", accessExpiresAt: 4e12, user: { id, email: null, phone: null } },
    // Only `context.user.id` is read by the matcher; the rest is a minimal valid shape.
    context: { user: { id, email: null, phone: null }, profile: null, roles: [], activeRole: null, merchant: null } as AuthContextValue["context"],
    verifiedContextEpoch: 1,
  };
}
function supabaseReady(id: string): Partial<AuthContextValue> {
  return {
    authStatus: "authenticated_ready",
    authSource: "supabase",
    appSession: { authSource: "supabase", accessToken: "at", accessExpiresAt: 4e12, user: { id, email: null, phone: null } },
    context: { user: { id, email: null, phone: null }, profile: null, roles: [], activeRole: null, merchant: null } as AuthContextValue["context"],
    verifiedContextEpoch: 1,
  };
}

const wrap = (v: AuthContextValue) => (
  <AuthContext.Provider value={v}>
    <Harness />
  </AuthContext.Provider>
);

async function settle(ms: number) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}
function pending<T>(p: Promise<T>) {
  let done = false;
  void p.then(() => (done = true));
  return () => done;
}

describe("matchesFederatedIdentity (pure §2 predicate)", () => {
  const ok = { authStatus: "authenticated_ready", authSource: "DilMart_federated", appSession: { authSource: "DilMart_federated", user: { id: "B" } }, context: { user: { id: "B" } }, verifiedContextEpoch: 1 } as never;
  it("true only when ALL five conditions agree on the expected customer", () => {
    expect(matchesFederatedIdentity(ok, "B", 1)).toBe(true);
    expect(matchesFederatedIdentity(ok, "OTHER", 1)).toBe(false); // wrong id
  });
  it("false for supabase source even when ids match", () => {
    const sup = { authStatus: "authenticated_ready", authSource: "supabase", appSession: { authSource: "supabase", user: { id: "B" } }, context: { user: { id: "B" } }, verifiedContextEpoch: 1 } as never;
    expect(matchesFederatedIdentity(sup, "B", 1)).toBe(false);
  });
  it("false when appSession id and context id disagree", () => {
    const mixed = { authStatus: "authenticated_ready", authSource: "DilMart_federated", appSession: { authSource: "DilMart_federated", user: { id: "B" } }, context: { user: { id: "OLD" } }, verifiedContextEpoch: 1 } as never;
    expect(matchesFederatedIdentity(mixed, "B", 1)).toBe(false);
  });
  it("false when not authenticated_ready (e.g. offline)", () => {
    const off = { authStatus: "authenticated_offline", authSource: "DilMart_federated", appSession: { authSource: "DilMart_federated", user: { id: "B" } }, context: { user: { id: "B" } }, verifiedContextEpoch: 1 } as never;
    expect(matchesFederatedIdentity(off, "B", 1)).toBe(false);
  });
});

describe("useAwaitAuthReady (identity-bound §2/§3/§4)", () => {
  it("§4 stale authenticated_ready (previous supabase identity) does NOT resolve ready; the NEW federated B does", async () => {
    const { rerender } = render(wrap(value(supabaseReady("cust-OLD"))));
    const p = awaitReady!("cust-B", 1, 5000);
    const isDone = pending(p);
    await settle(150); // several polls against the stale identity
    expect(isDone()).toBe(false); // stale authenticated_ready(supabase/OLD) must NOT satisfy handoff for B

    await act(async () => {
      rerender(wrap(value(federatedReady("cust-B")))); // context switches to the new federated identity
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(await p).toBe("ready");
  });

  it("§2 authenticated_ready with the WRONG customer id is not ready; corrected id becomes ready", async () => {
    const { rerender } = render(wrap(value(federatedReady("cust-WRONG"))));
    const p = awaitReady!("cust-B", 1, 5000);
    const isDone = pending(p);
    await settle(150);
    expect(isDone()).toBe(false); // right source, wrong customer → not ready

    await act(async () => {
      rerender(wrap(value(federatedReady("cust-B"))));
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(await p).toBe("ready");
  });

  it("§2 authenticated_ready but authSource=supabase never resolves ready → bounded timeout", async () => {
    render(wrap(value(supabaseReady("cust-B")))); // ids match but source is supabase
    const outcome = await awaitReady!("cust-B", 1, 200); // bounded — must not hang
    expect(outcome).toBe("timeout");
  });

  it("§3 authenticated_offline yields a bounded offline outcome (never ready)", async () => {
    render(wrap(value({ authStatus: "authenticated_offline", authSource: "DilMart_federated" })));
    const outcome = await awaitReady!("cust-B", 1, 200);
    expect(outcome).toBe("offline");
  });

  it("storage_error is definitive and resolves immediately (not ready)", async () => {
    render(wrap(value({ authStatus: "storage_error" })));
    expect(await awaitReady!("cust-B", 1, 5000)).toBe("storage_error");
  });
});

// ── §9.3 readiness must be bound to the identity EPOCH, not only the customer ──
/**
 * The dangerous case is the SAME customer redeeming a NEW session family. Every id predicate still
 * agrees, so a leftover ready-state from the previous family satisfied the fresh handoff — and because
 * the first poll tick runs synchronously, before React has committed the new provider state, navigation
 * happened before the new context was authoritative.
 */
describe("§9.3 readiness is epoch-bound", () => {
  function federatedReadyAtEpoch(id: string, epoch: number): Partial<AuthContextValue> {
    return { ...federatedReady(id), verifiedContextEpoch: epoch };
  }

  it("the pure predicate rejects a ready snapshot from a PREVIOUS epoch for the same customer", () => {
    const snapshotForOldFamily = {
      authStatus: "authenticated_ready",
      authSource: "DilMart_federated",
      appSession: { authSource: "DilMart_federated", user: { id: "cust-A" } },
      context: { user: { id: "cust-A" } },
      verifiedContextEpoch: 7,
    } as never;

    // Same customer, and every id agrees — but this readiness belongs to epoch 7, and the handoff we are
    // waiting on established epoch 8.
    expect(matchesFederatedIdentity(snapshotForOldFamily, "cust-A", 7)).toBe(true);
    expect(matchesFederatedIdentity(snapshotForOldFamily, "cust-A", 8)).toBe(false);
  });

  it("a same-customer new-family handoff does NOT resolve on the previous epoch's ready state", async () => {
    // Customer A is already fully ready for family-1 / epoch 7.
    const { rerender } = render(wrap(value(federatedReadyAtEpoch("cust-A", 7))));

    // A new handoff for the SAME customer establishes family-2 / epoch 8. The provider still holds the
    // epoch-7 snapshot at this instant — exactly the window the first synchronous tick used to read.
    const p = awaitReady!("cust-A", 8, 5000);
    const isDone = pending(p);
    await settle(150);
    expect(isDone()).toBe(false); // must NOT have reported ready off the stale epoch

    // /auth/context for epoch 8 is accepted; only now may readiness resolve.
    rerender(wrap(value(federatedReadyAtEpoch("cust-A", 8))));
    await settle(120);
    expect(await p).toBe("ready");
  });
});
