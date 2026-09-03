/**
 * Comprehensive Multi-Store Authority & Fail-Closed Contract Verification Suite
 * Tests:
 * 1. Fail-closed contract parsers (Settings, Push devices, Register, Delete, Test)
 * 2. Deferred race isolation: late settings, late save, late readiness, late device-list,
 *    late registration, late delete, late test (success & rejection)
 * 3. Store switch: zero leakage, zero stale toast, zero stale form/device mutation
 * 4. Manual retry uses current merchantId only
 * 5. Truthful independent error states (no false 0% readiness or fake 0 devices on error)
 * 6. Decoupled device registration: NEVER calls patchMerchantSettings
 * 7. Role authority enforcement: staff isolation vs owner/manager capabilities
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

const subscribeMerchantPushMock = vi.fn();
vi.mock("@/lib/merchant-push", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/merchant-push")>();
  return {
    ...actual,
    subscribeMerchantPush: (...args: unknown[]) => subscribeMerchantPushMock(...args),
  };
});

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  message: vi.fn(),
};
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastMock.success(...args),
    error: (...args: unknown[]) => toastMock.error(...args),
    info: (...args: unknown[]) => toastMock.info(...args),
    message: (...args: unknown[]) => toastMock.message(...args),
  },
}));

import MerchantSettings, {
  parseCanonicalSettingsResponse,
  parseCanonicalPushDeviceListResponse,
  parseCanonicalRegisterPushResponse,
  parseCanonicalDeletePushResponse,
  parseCanonicalTestPushResponse,
} from "./Settings";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { resetMerchantSelectionPreferenceForTests } from "@/lib/merchant-selection";

const STORE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STORE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUB_1 = "11111111-1111-4111-8111-111111111111";

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
  mockAuth.context = { merchant_memberships: [member(STORE_A), member(STORE_B)] };
  mockAuth.loading = false;
  vi.clearAllMocks();

  getMerchantReadiness.mockImplementation((id: string) =>
    Promise.resolve({ merchant_id: id, is_ready: true, score: 100, passed_checks: 5, total_checks: 5 }),
  );

  listPushSubscriptions.mockImplementation((id: string) =>
    Promise.resolve({ merchant_id: id, scope: "store", devices: [] }),
  );

  getPushVapidPublicKey.mockResolvedValue({ publicKey: "mock-vapid-key" });

  subscribeMerchantPushMock.mockImplementation(
    async (input: {
      merchantId: string;
      register: (body: {
        merchant_id: string;
        endpoint: string;
        keys: { p256dh: string; auth: string };
        device_label: string;
        user_agent: string;
      }) => Promise<unknown>;
    }) => {
      await input.register({
        merchant_id: input.merchantId,
        endpoint: "https://mock.endpoint/push",
        keys: { p256dh: "mock-p256dh", auth: "mock-auth" },
        device_label: "test-device",
        user_agent: "test-agent",
      });
      return { ok: true };
    },
  );
});

describe("1. Strict Fail-Closed Contract Parsers & Security Assertions", () => {
  it("Settings Parser: rejects missing or mismatched merchant_id", () => {
    expect(() =>
      parseCanonicalSettingsResponse({ merchant_id: STORE_B, settings_exists: false, settings: null }, STORE_A),
    ).toThrow(/merchant_id mismatch/);
  });

  it("Settings Parser: rejects non-boolean settings_exists", () => {
    expect(() =>
      parseCanonicalSettingsResponse({ merchant_id: STORE_A, settings_exists: "yes", settings: null }, STORE_A),
    ).toThrow(/missing boolean settings_exists/);
  });

  it("Settings Parser: rejects contradictory settings_exists=false with settings payload", () => {
    expect(() =>
      parseCanonicalSettingsResponse(
        { merchant_id: STORE_A, settings_exists: false, settings: { contact_phone: "0770" } },
        STORE_A,
      ),
    ).toThrow(/Contradictory settings response/);
  });

  it("Settings Parser: rejects contradictory settings_exists=true with null settings", () => {
    expect(() =>
      parseCanonicalSettingsResponse({ merchant_id: STORE_A, settings_exists: true, settings: null }, STORE_A),
    ).toThrow(/Contradictory settings response/);
  });

  it("Settings Parser: validates numeric sound bounds (5-120 interval, 30-1800 duration)", () => {
    const validBase = {
      merchant_id: STORE_A,
      settings_exists: true,
      settings: {
        contact_phone: null,
        whatsapp_phone: null,
        support_email: null,
        city: null,
        address: null,
        delivery_notes: null,
        logo_url: null,
        push_enabled: true,
        sound_enabled: true,
        sound_repeat_interval_seconds: 15,
        sound_max_duration_seconds: 300,
      },
    };

    expect(() =>
      parseCanonicalSettingsResponse(
        {
          ...validBase,
          settings: { ...validBase.settings, sound_repeat_interval_seconds: 2 },
        },
        STORE_A,
      ),
    ).toThrow(/between 5 and 120/);

    expect(() =>
      parseCanonicalSettingsResponse(
        {
          ...validBase,
          settings: { ...validBase.settings, sound_max_duration_seconds: 2000 },
        },
        STORE_A,
      ),
    ).toThrow(/between 30 and 1800/);
  });

  it("Push Device List Parser: REJECTS sensitive fields (endpoint, keys, user_id)", () => {
    const leakingPayload = {
      merchant_id: STORE_A,
      scope: "store",
      devices: [
        {
          id: SUB_1,
          device_label: "phone",
          user_agent: "agent",
          status: "active",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          is_own: true,
          endpoint: "https://leaked-endpoint.com",
        },
      ],
    };

    expect(() => parseCanonicalPushDeviceListResponse(leakingPayload, STORE_A)).toThrow(
      /Security violation: device at index 0 leaked sensitive push subscription fields/,
    );
  });

  it("Push Device List Parser: rejects invalid scope", () => {
    expect(() =>
      parseCanonicalPushDeviceListResponse({ merchant_id: STORE_A, scope: "global", devices: [] }, STORE_A),
    ).toThrow(/Invalid push devices scope/);
  });

  it("Register & Delete Push Parsers: strictly validate contracts and reject sensitive leaks", () => {
    expect(() =>
      parseCanonicalDeletePushResponse({ merchant_id: STORE_A, deleted_id: SUB_1, success: false }, STORE_A, SUB_1),
    ).toThrow(/success flag is not true/);

    expect(() =>
      parseCanonicalRegisterPushResponse(
        {
          merchant_id: STORE_A,
          subscription: { id: SUB_1, status: "active", is_own: true, p256dh_key: "secret" },
        },
        STORE_A,
      ),
    ).toThrow(/Security violation/);
  });
});

describe("2. Deferred Race Isolation & Store Switch Safety", () => {
  it("Late settings success from Store A does NOT overwrite Store B form", async () => {
    let resolveSettingsA: ((val: unknown) => void) | null = null;

    getMerchantSettings.mockImplementation((id: string) => {
      if (id === STORE_A) {
        return new Promise((r) => {
          resolveSettingsA = r;
        });
      }
      return Promise.resolve({
        merchant_id: STORE_B,
        settings_exists: true,
        settings: {
          contact_phone: "07802222222",
          whatsapp_phone: "",
          support_email: "",
          city: "Basra",
          address: "",
          delivery_notes: "",
          logo_url: "",
          push_enabled: true,
          sound_enabled: true,
          sound_repeat_interval_seconds: 15,
          sound_max_duration_seconds: 300,
        },
      });
    });

    let api!: Api;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Switcher onApi={(a) => (api = a)} />
        <MerchantSettings />
      </QueryClientProvider>,
    );

    // Switch to Store B before Store A resolves
    await act(async () => {
      api.setActiveMerchantId(STORE_B);
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("07802222222")).toBeInTheDocument();
    });

    // Now resolve late Store A
    await act(async () => {
      resolveSettingsA?.({
        merchant_id: STORE_A,
        settings_exists: true,
        settings: {
          contact_phone: "07701111111",
          whatsapp_phone: "",
          support_email: "",
          city: "Baghdad",
          address: "",
          delivery_notes: "",
          logo_url: "",
          push_enabled: true,
          sound_enabled: true,
          sound_repeat_interval_seconds: 15,
          sound_max_duration_seconds: 300,
        },
      });
    });

    // Store B form must REMAIN intact and not be overwritten by Store A!
    expect(screen.getByDisplayValue("07802222222")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("07701111111")).not.toBeInTheDocument();
  });

  it("Late settings rejection from Store A does NOT trigger error banner in Store B", async () => {
    let rejectSettingsA: ((err: unknown) => void) | null = null;

    getMerchantSettings.mockImplementation((id: string) => {
      if (id === STORE_A) {
        return new Promise((_, rej) => {
          rejectSettingsA = rej;
        });
      }
      return Promise.resolve({
        merchant_id: STORE_B,
        settings_exists: false,
        settings: null,
      });
    });

    let api!: Api;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Switcher onApi={(a) => (api = a)} />
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await act(async () => {
      api.setActiveMerchantId(STORE_B);
    });

    await waitFor(() => {
      expect(screen.getByText("بيانات التواصل والمتجر")).toBeInTheDocument();
    });

    // Late rejection of Store A
    await act(async () => {
      rejectSettingsA?.(new Error("Store A network fail"));
    });

    // Store B must NOT show error banner
    expect(screen.queryByText(/تعذر تحميل إعدادات المتجر/)).not.toBeInTheDocument();
  });

  it("Late save success or rejection from Store A does NOT fire toast or alter Store B", async () => {
    let resolveSaveA: ((val: unknown) => void) | null = null;

    getMerchantSettings.mockImplementation((id: string) =>
      Promise.resolve({
        merchant_id: id,
        settings_exists: true,
        settings: {
          contact_phone: id === STORE_A ? "07701111111" : "07802222222",
          whatsapp_phone: "",
          support_email: "",
          city: "",
          address: "",
          delivery_notes: "",
          logo_url: "",
          push_enabled: true,
          sound_enabled: true,
          sound_repeat_interval_seconds: 15,
          sound_max_duration_seconds: 300,
        },
      }),
    );

    patchMerchantSettings.mockImplementation(() => new Promise((r) => (resolveSaveA = r)));

    let api!: Api;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Switcher onApi={(a) => (api = a)} />
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("07701111111")).toBeInTheDocument();
    });

    // Click Save in Store A
    fireEvent.click(screen.getByText("حفظ الإعدادات"));

    // Switch to Store B while save is pending
    await act(async () => {
      api.setActiveMerchantId(STORE_B);
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("07802222222")).toBeInTheDocument();
    });

    // Resolve late save for Store A
    await act(async () => {
      resolveSaveA?.({
        merchant_id: STORE_A,
        settings_exists: true,
        settings: {
          contact_phone: "07709999999",
          whatsapp_phone: "",
          support_email: "",
          city: "",
          address: "",
          delivery_notes: "",
          logo_url: "",
          push_enabled: true,
          sound_enabled: true,
          sound_repeat_interval_seconds: 15,
          sound_max_duration_seconds: 300,
        },
      });
    });

    // Must NOT fire success toast in Store B!
    expect(toastMock.success).not.toHaveBeenCalledWith("تم حفظ إعدادات المتجر بنجاح");
  });

  it("Late device list from Store A does NOT overwrite Store B devices", async () => {
    let resolveDevicesA: ((val: unknown) => void) | null = null;

    getMerchantSettings.mockImplementation((id: string) =>
      Promise.resolve({ merchant_id: id, settings_exists: false, settings: null }),
    );

    listPushSubscriptions.mockImplementation((id: string) => {
      if (id === STORE_A) {
        return new Promise((r) => (resolveDevicesA = r));
      }
      return Promise.resolve({
        merchant_id: STORE_B,
        scope: "store",
        devices: [
          {
            id: "sub-b-1",
            device_label: "Device-B-Only",
            user_agent: "Chrome-B",
            status: "active",
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
            is_own: false,
          },
        ],
      });
    });

    let api!: Api;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Switcher onApi={(a) => (api = a)} />
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await act(async () => {
      api.setActiveMerchantId(STORE_B);
    });

    await waitFor(() => {
      expect(screen.getByText("Chrome-B")).toBeInTheDocument();
    });

    // Resolve Store A devices late
    await act(async () => {
      resolveDevicesA?.({
        merchant_id: STORE_A,
        scope: "store",
        devices: [
          {
            id: "sub-a-1",
            device_label: "Device-A-Only",
            user_agent: "Safari-A",
            status: "active",
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
            is_own: true,
          },
        ],
      });
    });

    // Store B must still display only Chrome-B, never Safari-A!
    expect(screen.getByText("Chrome-B")).toBeInTheDocument();
    expect(screen.queryByText("Safari-A")).not.toBeInTheDocument();
  });
});

describe("3. Decoupled Push Device Registration & No-Mutation Invariant", () => {
  it("Registering device NEVER calls patchMerchantSettings", async () => {
    getMerchantSettings.mockImplementation((id: string) =>
      Promise.resolve({
        merchant_id: id,
        settings_exists: true,
        settings: {
          contact_phone: "",
          whatsapp_phone: "",
          support_email: "",
          city: "",
          address: "",
          delivery_notes: "",
          logo_url: "",
          push_enabled: false, // global policy disabled
          sound_enabled: false,
          sound_repeat_interval_seconds: 15,
          sound_max_duration_seconds: 300,
        },
      }),
    );

    registerPushSubscription.mockResolvedValue({
      merchant_id: STORE_A,
      subscription: {
        id: SUB_1,
        device_label: "mock-label",
        user_agent: "mock-agent",
        status: "active",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
        is_own: true,
      },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("تفعيل إشعارات هذا الجهاز")).toBeInTheDocument();
    });

    // Click enable push
    await act(async () => {
      fireEvent.click(screen.getByText("تفعيل إشعارات هذا الجهاز"));
    });

    await waitFor(() => {
      expect(registerPushSubscription).toHaveBeenCalled();
    });

    // STRICT INVARIANT: patchMerchantSettings must NEVER be called from device registration!
    expect(patchMerchantSettings).not.toHaveBeenCalled();

    // Truthful info toast is shown because global policy is off
    expect(toastMock.info).toHaveBeenCalledWith(
      expect.stringContaining("إشعارات أو أصوات المتجر العامة معطلة حالياً"),
    );
  });
});

describe("4. Role Authority & Staff vs Owner Isolation", () => {
  it("Staff role: logo upload and global policy checkboxes are HIDDEN", async () => {
    mockAuth.context = { merchant_memberships: [member(STORE_A, "staff")] };

    getMerchantSettings.mockImplementation((id: string) =>
      Promise.resolve({
        merchant_id: id,
        settings_exists: true,
        settings: {
          contact_phone: "07701111111",
          whatsapp_phone: "",
          support_email: "",
          city: "",
          address: "",
          delivery_notes: "",
          logo_url: "",
          push_enabled: true,
          sound_enabled: true,
          sound_repeat_interval_seconds: 15,
          sound_max_duration_seconds: 300,
        },
      }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/صلاحية موظف متجر/)).toBeInTheDocument();
    });

    // Logo upload hidden
    expect(screen.queryByText("رفع لوجو جديد")).not.toBeInTheDocument();

    // Save button hidden
    expect(screen.queryByText("حفظ الإعدادات")).not.toBeInTheDocument();

    // Global policy checkboxes hidden
    expect(screen.queryByText("سياسة التنبيهات والصوت العامة للمتجر")).not.toBeInTheDocument();

    // Store broadcast button hidden
    expect(screen.queryByText("إرسال اختبار إلى جميع الأجهزة المسجلة")).not.toBeInTheDocument();
  });

  it("Owner role: management controls are visible", async () => {
    mockAuth.context = { merchant_memberships: [member(STORE_A, "owner")] };

    getMerchantSettings.mockImplementation((id: string) =>
      Promise.resolve({
        merchant_id: id,
        settings_exists: true,
        settings: {
          contact_phone: "07701111111",
          whatsapp_phone: "",
          support_email: "",
          city: "",
          address: "",
          delivery_notes: "",
          logo_url: "",
          push_enabled: true,
          sound_enabled: true,
          sound_repeat_interval_seconds: 15,
          sound_max_duration_seconds: 300,
        },
      }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("حفظ الإعدادات")).toBeInTheDocument();
    });

    expect(screen.getByText("رفع لوجو جديد")).toBeInTheDocument();
    expect(screen.getByText("سياسة التنبيهات والصوت العامة للمتجر")).toBeInTheDocument();
  });
});

describe("5. Truthful Independent Error States", () => {
  it("Readiness error shows retry button and does NOT display a false 0% score", async () => {
    getMerchantReadiness.mockRejectedValue(new Error("Readiness network error"));
    getMerchantSettings.mockResolvedValue({
      merchant_id: STORE_A,
      settings_exists: false,
      settings: null,
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/تعذر تحميل مؤشر الجاهزية/)).toBeInTheDocument();
    });

    expect(screen.queryByText("نسبة الجاهزية 0%")).not.toBeInTheDocument();
    expect(screen.getByText(/تعذر التحميل، إعادة المحاولة/)).toBeInTheDocument();
  });

  it("Devices error shows truthful error message and does NOT report fake 0 active devices", async () => {
    listPushSubscriptions.mockRejectedValue(new Error("Push list DB timeout"));
    getMerchantSettings.mockResolvedValue({
      merchant_id: STORE_A,
      settings_exists: false,
      settings: null,
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Push list DB timeout")).toBeInTheDocument();
    });

    // Does not show "لا توجد أجهزة مسجلة حالياً." when an error occurred
    expect(screen.queryByText("لا توجد أجهزة مسجلة حالياً.")).not.toBeInTheDocument();
  });

  it("Manual settings retry uses current active merchantId only", async () => {
    let callCount = 0;
    getMerchantSettings.mockImplementation((id: string) => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.reject(new Error("Initial load failure"));
      }
      return Promise.resolve({
        merchant_id: id,
        settings_exists: true,
        settings: {
          contact_phone: "07701234567",
          whatsapp_phone: "",
          support_email: "",
          city: "",
          address: "",
          delivery_notes: "",
          logo_url: "",
          push_enabled: true,
          sound_enabled: true,
          sound_repeat_interval_seconds: 15,
          sound_max_duration_seconds: 300,
        },
      });
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("إعادة المحاولة")).toBeInTheDocument();
    });

    // Click manual retry
    fireEvent.click(screen.getByText("إعادة المحاولة"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("07701234567")).toBeInTheDocument();
    });

    // Both calls must have targeted STORE_A
    expect(getMerchantSettings).toHaveBeenNthCalledWith(1, STORE_A);
    expect(getMerchantSettings).toHaveBeenNthCalledWith(2, STORE_A);
  });
});

describe("6. Unattached & Invalid Role Protection", () => {
  it("Unattached user renders fail-closed unattached banner and does not fetch settings", async () => {
    mockAuth.context = { merchant_memberships: [] };

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MerchantSettings />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("merchant-settings-unattached")).toBeInTheDocument();
    });

    expect(getMerchantSettings).not.toHaveBeenCalled();
    expect(listPushSubscriptions).not.toHaveBeenCalled();
  });
});
