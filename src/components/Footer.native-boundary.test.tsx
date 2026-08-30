import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Footer from "@/components/Footer";

const isNativeMock = vi.fn();

vi.mock("@/lib/capacitor", () => ({
  isNative: () => isNativeMock(),
}));

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

describe("Footer native boundary", () => {
  beforeEach(() => {
    isNativeMock.mockReset();
  });

  it("hides merchant join/login entry points on native", () => {
    isNativeMock.mockReturnValue(true);
    renderFooter();

    expect(screen.queryByText("انضم كتاجر")).not.toBeInTheDocument();
    expect(screen.queryByText("تسجيل دخول التاجر")).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/merchant/register"]')).toBeNull();
    expect(document.querySelector('a[href="/merchant/login"]')).toBeNull();
  });

  it("keeps merchant join/login entry points on web", () => {
    isNativeMock.mockReturnValue(false);
    renderFooter();

    expect(screen.getByText("انضم كتاجر")).toBeInTheDocument();
    expect(screen.getByText("تسجيل دخول التاجر")).toBeInTheDocument();
    expect(document.querySelector('a[href="/merchant/register"]')).not.toBeNull();
    expect(document.querySelector('a[href="/merchant/login"]')).not.toBeNull();
  });
});
