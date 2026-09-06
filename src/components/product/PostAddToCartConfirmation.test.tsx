import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PostAddToCartConfirmation, { AUTO_DISMISS_MS } from "./PostAddToCartConfirmation";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("PostAddToCartConfirmation — Precise Pause & Resume Lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("1. dismisses after seven uninterrupted seconds", () => {
    const onDismiss = vi.fn();
    render(
      <MemoryRouter>
        <PostAddToCartConfirmation
          open={true}
          productName="ساعة يد فاخرة"
          quantity={1}
          onDismiss={onDismiss}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId("post-add-to-cart-confirmation")).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();

    // Advance 6999ms — should still be visible
    act(() => {
      vi.advanceTimersByTime(6999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // Advance 1ms more (total 7000ms) — should dismiss
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("2. does not dismiss while focused or touched", () => {
    const onDismiss = vi.fn();
    render(
      <MemoryRouter>
        <PostAddToCartConfirmation
          open={true}
          productName="ساعة يد فاخرة"
          quantity={1}
          onDismiss={onDismiss}
        />
      </MemoryRouter>
    );

    const card = screen.getByTestId("post-add-to-cart-confirmation");

    // Advance 3000ms uninterrupted
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // User focuses/touches the card
    fireEvent.focus(card);

    // Advance 10,000ms while paused — should NEVER dismiss
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // Repeated touch/focus events do not alter the paused state or crash
    fireEvent.touchStart(card);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("3. resumes from the remaining duration, not seven seconds again", () => {
    const onDismiss = vi.fn();
    render(
      <MemoryRouter>
        <PostAddToCartConfirmation
          open={true}
          productName="ساعة يد فاخرة"
          quantity={1}
          onDismiss={onDismiss}
        />
      </MemoryRouter>
    );

    const card = screen.getByTestId("post-add-to-cart-confirmation");

    // 1. Run for 2500ms (remaining: 4500ms)
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // 2. Pause
    fireEvent.mouseEnter(card);

    // 3. Stay paused for 8000ms
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // 4. Resume
    fireEvent.mouseLeave(card);

    // 5. Advance by 4499ms (remaining was 4500ms) -> should NOT dismiss yet
    act(() => {
      vi.advanceTimersByTime(4499);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // 6. Advance 2ms more (total 4501ms after resume) -> MUST dismiss now!
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // This proves it resumed with 4500ms, NOT 7000ms!
  });

  it("4. cleans up its timer on unmount without pending state updates", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(
      <MemoryRouter>
        <PostAddToCartConfirmation
          open={true}
          productName="ساعة يد فاخرة"
          quantity={1}
          onDismiss={onDismiss}
        />
      </MemoryRouter>
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    unmount();

    // Advance remaining time + more
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("5. a new successful addition starts a fresh 7000ms timer", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <PostAddToCartConfirmation
          open={true}
          productName="منتج أول"
          quantity={1}
          onDismiss={onDismiss}
        />
      </MemoryRouter>
    );

    // Advance 5000ms (only 2000ms left for product 1)
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // User adds a second product while the first is still open
    rerender(
      <MemoryRouter>
        <PostAddToCartConfirmation
          open={true}
          productName="منتج ثانٍ"
          quantity={2}
          onDismiss={onDismiss}
        />
      </MemoryRouter>
    );

    // If it did not reset, 2001ms would dismiss it.
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    // Should NOT have dismissed because the timer was reset to a fresh 7000ms!
    expect(onDismiss).not.toHaveBeenCalled();

    // Now advance remaining 4501ms (total 7001ms since second addition)
    act(() => {
      vi.advanceTimersByTime(4501);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
