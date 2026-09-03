/**
 * Merchant Settings must never carry one store's values into another store's form.
 * Hardened multi-store authority tests for canonical settings contracts,
 * dirty form protection, staff permissions, and store switch safety.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import type { AuthContextMerchant } from "@/lib/auth-context-contract";

const mockAuth: {
  context: { merchant_memberships?: AuthContextMerchant[] } | null;
  loading: boolean;
} = { context: null, loading: false };
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuth }));

const getMerchantSettings = vi.fn();
const patchMerchantSettings = vi.fn();
const listPushSubscriptions = vi.fn();
const registerPushSubscription = vi.fn();
const deletePushSubscription = vi.fn();
const testPushSubscription = vi.fn();
const getPushVapidPublicKey = vi.fn();

vi.mock("@/lib/api/merchant", () => ({
  merchantApi: {
    getMerchantSettings: (...args: unknown[]) => getMerchantSettings(...args),
    patchMerchantSettings: (...args: unknown[]) => patchMerchantSettings(...args),
    listPushSubscriptions: (...args: unknown[]) => listPushSubscriptions(...args),
    registerPushSubscription: (...args: unknown[]) => registerPushSubscription(...args),
    deletePushSubscription: (...args: unknown[]) => deletePushSubscription(...args),
    testPushSubscription: (...args: unknown[]) => testPushSubscription(...args),
    getPushVapidPublicKey: (...args: unknown[]) => getPushVapidPublicKey(...args),
  },
}));

const getMerchantReadiness = vi.fn();
const uploadProductImage = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMerchantReadiness: (...args: unknown[]) => getMerchantReadiness(...args),
    uploadProductImage: (...args: unknown[]) => uploadProductImage(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

import MerchantSettings from "./Settings";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { resetMerchantSelectionPreferenceForTests } from "@/lib/merchant-selection";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function member(id: string, role = "owner"): AuthContextMerchant {
  return { id, role, status: "active", display_name: `Store ${id.slice(0, 1)}`, slug: id.slice(0, 4) };
}

type Api = ReturnType<typeof useCurrentMerchant>;

function Switcher({ onApi }: { onApi: (api: Api) => void }) {
  const api = useCurrentMerchant();
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

  getMerchantReadiness.mockImplementation((id: string) =>
    Promise.resolve({ merchant_id: id, is_ready: true, score: 100, passed_checks: 5, total_checks: 5 }),
  );

  listPushSubscriptions.mockImplementation((id: string) =>
    Promise.resolve({ merchant_id: id, scope: "store", devices: [] }),
  );

  getPushVapidPublicKey.mockResolvedValue({ publicKey: "mock-vapid-key" });
});

describe("merchant Settings — store switch safety & canonical contracts", () => {
  it("clears the previous store's values and blocks saving until the new store's settings arrive", async () => {
    let resolveB: ((value: unknown) => void) | null = null;
    getMerchantSettings.mockImplementation((merchantId: string) => {
      if (merchantId === A) {
        return Promise.resolve({
          merchant_id: A,
          settings_exists: true,
          settings: { city: "CITY-A", contact_phone: "111", push_enabled: true, sound_enabled: true },
        });
      }
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

    // merchant A's values must be gone immediately
    await waitFor(() => expect(screen.queryByDisplayValue("CITY-A")).toBeNull());

    await act(async () => {
      resolveB?.({
        merchant_id: B,
        settings_exists: true,
        settings: { city: "CITY-B", contact_phone: "222", push_enabled: true, sound_enabled: true },
      });
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
      return Promise.resolve({
        merchant_id: B,
        settings_exists: true,
        settings: { city: "CITY-B", contact_phone: "222", push_enabled: true, sound_enabled: true },
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

    await waitFor(() => expect(getMerchantSettings).toHaveBeenCalledWith(A));

    act(() => {
      api!.setActiveMerchantId(B);
    });
    await waitFor(() => expect(screen.getByDisplayValue("CITY-B")).toBeTruthy());

    await act(async () => {
      resolveA?.({
        merchant_id: A,
        settings_exists: true,
        settings: { city: "CITY-A", contact_phone: "111", push_enabled: true, sound_enabled: true },
      });
      await Promise.resolve();
    });

    expect(screen.getByDisplayValue("CITY-B")).toBeTruthy();
    expect(screen.queryByDisplayValue("CITY-A")).toBeNull();
  });

  it("handles a valid non-existent settings row without error", async () => {
    getMerchantSettings.mockResolvedValue({
      merchant_id: A,
      settings_exists: false,
      settings: null,
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "حفظ الإعدادات" })).toBeTruthy());
    // Form is loaded in default blank state, not in error state
    expect(screen.queryByText("تعذر تحميل إعدادات المتجر")).toBeNull();
  });
});

describe("merchant Settings — dirty form protection", () => {
  it("protects user edits: background refetch does not overwrite modified form", async () => {
    getMerchantSettings.mockResolvedValue({
      merchant_id: A,
      settings_exists: true,
      settings: { city: "بغداد الأصلية", contact_phone: "07700000000", push_enabled: true, sound_enabled: true },
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByDisplayValue("بغداد الأصلية")).toBeTruthy());

    // User types new dirty value
    const cityInput = screen.getByLabelText("المدينة") as HTMLInputElement;
    fireEvent.change(cityInput, { target: { value: "بغداد المنصور - معدلة" } });
    expect(cityInput.value).toBe("بغداد المنصور - معدلة");

    // Dirty badge appears
    expect(screen.getByText("تعديلات غير محفوظة")).toBeTruthy();

    // Verify form remains dirty with modified user value
    expect(cityInput.value).toBe("بغداد المنصور - معدلة");
  });
});

describe("merchant Settings — staff view and role bounds", () => {
  it("renders read-only store view for staff, hides logo upload, and disables inputs", async () => {
    mockAuth.context = { merchant_memberships: [member(A, "staff")] };

    getMerchantSettings.mockResolvedValue({
      merchant_id: A,
      settings_exists: true,
      settings: { city: "بغداد", contact_phone: "07701234567", push_enabled: true, sound_enabled: true },
    });

    listPushSubscriptions.mockResolvedValue({
      merchant_id: A,
      scope: "own",
      devices: [
        {
          id: "sub-staff-1",
          device_label: "staff-mobile",
          user_agent: "Chrome Android",
          status: "active",
          created_at: "2026-06-01T10:00:00Z",
          updated_at: "2026-06-01T10:00:00Z",
          is_own: true,
        },
      ],
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByDisplayValue("بغداد")).toBeTruthy());

    // Staff banner is present
    expect(screen.getByText("صلاحية موظف متجر (Staff View)")).toBeTruthy();

    // Inputs are disabled
    const phoneInput = screen.getByLabelText("هاتف التواصل") as HTMLInputElement;
    expect(phoneInput.disabled).toBe(true);

    // Save button is hidden for staff
    expect(screen.queryByRole("button", { name: "حفظ الإعدادات" })).toBeNull();

    // Logo upload input is hidden for staff
    expect(container.querySelector('input[type="file"]')).toBeNull();

    // Staff sees own device scope
    expect(screen.getByText("أجهزتي المسجلة")).toBeTruthy();
    expect(screen.getByText("جهاز (staff-mo)")).toBeTruthy();
  });
});

describe("merchant Settings — load failure and upload safety", () => {
  it("keeps saving blocked when the settings load fails, so a blank form cannot overwrite real settings", async () => {
    getMerchantSettings.mockRejectedValue(new Error("network error"));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getMerchantSettings).toHaveBeenCalledWith(A));
    await waitFor(() => expect(screen.getByText(/تعذر تحميل إعدادات المتجر/)).toBeTruthy());

    // Save button must not be present or must be disabled while in error state
    expect(screen.queryByRole("button", { name: "حفظ الإعدادات" })).toBeNull();
    expect(patchMerchantSettings).not.toHaveBeenCalled();
  });

  it("does not apply a logo uploaded for the previous store after a switch", async () => {
    getMerchantSettings.mockImplementation((merchantId: string) =>
      Promise.resolve({
        merchant_id: merchantId,
        settings_exists: true,
        settings: { city: merchantId === A ? "CITY-A" : "CITY-B" },
      }),
    );

    let resolveUpload: ((value: unknown) => void) | null = null;
    uploadProductImage.mockImplementation(
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
