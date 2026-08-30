// @vitest-environment jsdom
/**
 * STORE-PR6 §13/§28 — customer-safe Arabic handoff UX: correct state marker, a spinner only while
 * processing, a safe "continue to store" CTA on every terminal state (never a login redirect).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HandoffScreen } from "./HandoffScreen";
import type { HandoffUxState } from "./store-deep-link.types";

const terminal: HandoffUxState[] = ["expired", "already_used", "invalid", "unavailable", "retryable_error", "identity_verification_required", "blocked"];

describe("HandoffScreen", () => {
  it("processing shows a spinner and NO continue CTA", () => {
    render(<HandoffScreen state="processing" onContinue={vi.fn()} />);
    expect(screen.getByTestId("handoff-processing")).toBeTruthy();
    expect(screen.getByTestId("handoff-spinner")).toBeTruthy();
    expect(screen.queryByTestId("handoff-continue")).toBeNull();
  });

  for (const state of terminal) {
    it(`${state} renders its marker + a safe continue CTA (no login redirect)`, () => {
      const onContinue = vi.fn();
      render(<HandoffScreen state={state} onContinue={onContinue} />);
      expect(screen.getByTestId(`handoff-${state}`)).toBeTruthy();
      const cta = screen.getByTestId("handoff-continue");
      expect(cta.textContent).toContain("متابعة إلى المتجر");
      fireEvent.click(cta);
      expect(onContinue).toHaveBeenCalledTimes(1);
      // Never surfaces backend/internal detail or a "login" prompt.
      expect(screen.queryByText(/تسجيل الدخول|login/i)).toBeNull();
    });
  }
});
