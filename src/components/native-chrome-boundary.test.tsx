import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import IconNav from "@/components/IconNav";

const isNativeMock = vi.fn();

vi.mock("@/lib/capacitor", () => ({
  isNative: () => isNativeMock(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: null,
    session: null,
    isMerchantUser: false,
    isAdmin: false,
    isAgent: false,
    authStatus: "unauthenticated",
    bootstrapDelayed: false,
    contextLoading: false,
    context: null,
    storageError: null,
    isOffline: false,
    retryStorageBootstrap: vi.fn(),
    logoutCurrentDevice: vi.fn(),
  }),
}));

vi.mock("@/lib/cart-store", () => ({
  useCartStore: () => ({
    items: [],
    getItemCount: () => 0,
    getTotal: () => 0,
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({
      removeQueries: vi.fn(),
    }),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
    },
  },
}));

function collectInternalBackofficeHrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("a[href]"))
    .map((a) => a.getAttribute("href") || "")
    .filter((href) => {
      if (!href || href.startsWith("http") || href.startsWith("tel:") || href.startsWith("mailto:")) {
        return false;
      }
      return /^\/?(admin|merchant|agent)(\/|$)/.test(href.replace(/^#/, ""));
    });
}

describe("Native chrome has no backoffice entry anchors", () => {
  beforeEach(() => {
    isNativeMock.mockReset();
  });

  it("renders zero /admin|/merchant|/agent internal anchors on native chrome", () => {
    isNativeMock.mockReturnValue(true);
    const { container } = render(
      <MemoryRouter>
        <IconNav />
        <Footer />
        <BottomNav />
      </MemoryRouter>,
    );

    const forbidden = collectInternalBackofficeHrefs(container);
    expect(forbidden).toEqual([]);
    expect(forbidden.length).toBe(0);
  });

  it("still exposes merchant entry anchors on web chrome", () => {
    isNativeMock.mockReturnValue(false);
    const { container } = render(
      <MemoryRouter>
        <IconNav />
        <Footer />
        <BottomNav />
      </MemoryRouter>,
    );

    const forbidden = collectInternalBackofficeHrefs(container);
    expect(forbidden.some((h) => h.includes("/merchant"))).toBe(true);
  });
});
