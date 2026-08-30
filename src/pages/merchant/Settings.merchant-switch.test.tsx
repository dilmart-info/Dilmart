/**
 * Merchant Settings must never carry one store's values into another store's form.
 * The settings loader is not a React Query surface, so it needs its own switch guard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import type { AuthContextMerchant } from "@/lib/auth-context-contract";

const mockAuth: {
  context: { merchant_memberships?: AuthContextMerchant[] } | null;
  loading: boolean;
} = { context: null, loading: false };
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuth }));

const getMerchantSettings = vi.fn();
const upsertMerchantSettings = vi.fn();
const getMerchantReadiness = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMerchantSettings: (...args: unknown[]) => getMerchantSettings(...args),
    upsertMerchantSettings: (...args: unknown[]) => upsertMerchantSettings(...args),
    getMerchantReadiness: (...args: unknown[]) => getMerchantReadiness(...args),
    uploadProductImage: vi.fn(),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/merchant/MerchantPushSettings", () => ({ default: () => null }));

import MerchantSettings from "./Settings";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { resetMerchantSelectionPreferenceForTests } from "@/lib/merchant-selection";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function member(id: string): AuthContextMerchant {
  return { id, role: "owner", status: "active", display_name: `Store ${id.slice(0, 1)}`, slug: id.slice(0, 4) };
}

type Api = ReturnType<typeof useCurrentMerchant>;

function Switcher({ onApi }: { onApi: (api: Api) => void }) {
  const api = useCurrentMerchant();
  // Publish from an effect (after commit), never during render — a discarded render must not
  // hand out an API value.
  useEffect(() => {
    onApi(api);
  });
  return null;
}

beforeEach(() => {
  window.localStorage.clear();
  resetMerchantSelectionPreferenceForTests();
  mockAuth.context = { merchant_memberships: [member(A), member(B)] };
  mockAuth.loading = false;
  vi.clearAllMocks();
  getMerchantReadiness.mockResolvedValue({ is_ready: true, score: 100, passed_checks: 5, total_checks: 5 });
});

describe("merchant Settings — store switch safety", () => {
  it("clears the previous store's values and blocks saving until the new store's settings arrive", async () => {
    let resolveB: ((value: unknown) => void) | null = null;
    getMerchantSettings.mockImplementation((merchantId: string) => {
      if (merchantId === A) return Promise.resolve({ city: "CITY-A", contact_phone: "111" });
      return new Promise((resolve) => {
        resolveB = resolve;
      });
    });

    let api: Api | null = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Switcher
          onApi={(value) => {
            api = value;
          }}
        />
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByDisplayValue("CITY-A")).toBeTruthy());
    const saveButton = screen.getByRole("button", { name: "حفظ الإعدادات" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);

    act(() => {
      api!.setActiveMerchantId(B);
    });

    // merchant A's values must be gone immediately, and saving must be blocked while B loads
    await waitFor(() => expect(screen.queryByDisplayValue("CITY-A")).toBeNull());
    expect((screen.getByRole("button", { name: "حفظ الإعدادات" }) as HTMLButtonElement).disabled).toBe(true);
    expect(upsertMerchantSettings).not.toHaveBeenCalled();

    await act(async () => {
      resolveB?.({ city: "CITY-B", contact_phone: "222" });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByDisplayValue("CITY-B")).toBeTruthy());
    expect((screen.getByRole("button", { name: "حفظ الإعدادات" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("discards a late response for the previous store", async () => {
    let resolveA: ((value: unknown) => void) | null = null;
    getMerchantSettings.mockImplementation((merchantId: string) => {
      if (merchantId === A) {
        return new Promise((resolve) => {
          resolveA = resolve;
        });
      }
      return Promise.resolve({ city: "CITY-B", contact_phone: "222" });
    });

    let api: Api | null = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Switcher
          onApi={(value) => {
            api = value;
          }}
        />
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getMerchantSettings).toHaveBeenCalledWith(A));

    act(() => {
      api!.setActiveMerchantId(B);
    });
    await waitFor(() => expect(screen.getByDisplayValue("CITY-B")).toBeTruthy());

    await act(async () => {
      resolveA?.({ city: "CITY-A", contact_phone: "111" });
      await Promise.resolve();
    });

    expect(screen.getByDisplayValue("CITY-B")).toBeTruthy();
    expect(screen.queryByDisplayValue("CITY-A")).toBeNull();
  });
});

describe("merchant Settings — load failure and upload safety", () => {
  it("keeps saving blocked when the settings load fails, so a blank form cannot overwrite real settings", async () => {
    getMerchantSettings.mockRejectedValue(new Error("network"));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getMerchantSettings).toHaveBeenCalledWith(A));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "حفظ الإعدادات" }) as HTMLButtonElement).disabled).toBe(true),
    );

    // a failed GET is not "no settings": nothing may be written back
    expect(upsertMerchantSettings).not.toHaveBeenCalled();
  });

  it("does not apply a logo uploaded for the previous store after a switch", async () => {
    getMerchantSettings.mockImplementation((merchantId: string) =>
      Promise.resolve(merchantId === A ? { city: "CITY-A" } : { city: "CITY-B" }),
    );

    let resolveUpload: ((value: unknown) => void) | null = null;
    const { apiClient } = await import("@/lib/api-client");
    (apiClient.uploadProductImage as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );

    let api: Api | null = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <Switcher
          onApi={(value) => {
            api = value;
          }}
        />
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByDisplayValue("CITY-A")).toBeTruthy());

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["logo"], "logo.png", { type: "image/png" });
    await act(async () => {
      Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    // switch stores while the upload is still in flight
    act(() => {
      api!.setActiveMerchantId(B);
    });
    await waitFor(() => expect(screen.getByDisplayValue("CITY-B")).toBeTruthy());

    await act(async () => {
      resolveUpload?.({ public_url: "https://example.test/logo-for-A.png" });
      await Promise.resolve();
    });

    // merchant A's logo must not have landed in merchant B's form
    expect(container.querySelector('img[alt="Store logo"]')).toBeNull();
  });
});
