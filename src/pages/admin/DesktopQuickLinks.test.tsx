import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AdminDesktopQuickLinks from "./DesktopQuickLinks";

const listAdminDesktopQuickLinks = vi.fn();
const createAdminDesktopQuickLink = vi.fn();
const updateAdminDesktopQuickLink = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    listAdminDesktopQuickLinks: (...args: unknown[]) => listAdminDesktopQuickLinks(...args),
    createAdminDesktopQuickLink: (...args: unknown[]) => createAdminDesktopQuickLink(...args),
    updateAdminDesktopQuickLink: (...args: unknown[]) => updateAdminDesktopQuickLink(...args),
    deleteAdminDesktopQuickLink: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  listAdminDesktopQuickLinks.mockReset();
  createAdminDesktopQuickLink.mockReset();
  updateAdminDesktopQuickLink.mockReset();
});

function renderPage(rows: unknown[] = []) {
  listAdminDesktopQuickLinks.mockResolvedValue(rows);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminDesktopQuickLinks />
    </QueryClientProvider>,
  );
}

describe("Admin DesktopQuickLinks — create-form href validation feedback", () => {
  it("shows an inline error and disables Add for an unsafe href", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("مثال: كل العروض"), { target: { value: "رابط" } });
    fireEvent.change(screen.getByPlaceholderText("/offers أو /products?search=..."), {
      target: { value: "javascript:alert(1)" },
    });

    expect(await screen.findByText(/غير مسموح|غير صالح|رموز غير مسموحة/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /إضافة/ })).toBeDisabled();
    expect(createAdminDesktopQuickLink).not.toHaveBeenCalled();
  });

  it("shows an inline error and disables Add for an external URL — policy is internal-only", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("مثال: كل العروض"), { target: { value: "شريك" } });
    fireEvent.change(screen.getByPlaceholderText("/offers أو /products?search=..."), {
      target: { value: "https://partner.example.com" },
    });

    expect(await screen.findByText(/غير مسموح|غير صالح|رموز غير مسموحة|خارجية/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /إضافة/ })).toBeDisabled();
    expect(createAdminDesktopQuickLink).not.toHaveBeenCalled();
  });

  it("enables Add and shows no error for a valid internal href", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("مثال: كل العروض"), { target: { value: "العروض" } });
    fireEvent.change(screen.getByPlaceholderText("/offers أو /products?search=..."), {
      target: { value: "/offers" },
    });

    expect(screen.queryByText(/غير مسموح|غير صالح|رموز غير مسموحة/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /إضافة/ })).toBeEnabled();
  });

  it("allows entering and saving a literal %25 query value", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("مثال: كل العروض"), { target: { value: "خصم" } });
    fireEvent.change(screen.getByPlaceholderText("/offers أو /products?search=..."), {
      target: { value: "/products?search=50%25" },
    });

    expect(screen.queryByText(/غير مسموح|غير صالح|رموز غير مسموحة/)).not.toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: /إضافة/ });
    expect(addButton).toBeEnabled();
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(createAdminDesktopQuickLink).toHaveBeenCalledWith(
        expect.objectContaining({ href: "/products?search=50%25" }),
      );
    });
  });

  it("shows an inline error and disables Add for a malformed query key", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("مثال: كل العروض"), { target: { value: "خطأ" } });
    fireEvent.change(screen.getByPlaceholderText("/offers أو /products?search=..."), {
      target: { value: "/products?%ZZ=ok" },
    });

    expect(await screen.findByText(/غير مسموح|غير صالح|رموز غير مسموحة/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /إضافة/ })).toBeDisabled();
    expect(createAdminDesktopQuickLink).not.toHaveBeenCalled();
  });
});

describe("Admin DesktopQuickLinks — existing-row href edit validation", () => {
  it("editing an existing href to an invalid value shows an inline error and does not call update", async () => {
    renderPage([{ id: "row-1", label: "العروض", href: "/offers", sort_order: 1, is_active: true }]);
    const hrefInput = await screen.findByDisplayValue("/offers");

    fireEvent.change(hrefInput, { target: { value: "javascript:alert(1)" } });
    fireEvent.blur(hrefInput);

    expect(await screen.findByText(/غير مسموح|غير صالح|رموز غير مسموحة/)).toBeInTheDocument();
    expect(updateAdminDesktopQuickLink).not.toHaveBeenCalled();
  });

  it("editing an existing href to a valid value calls update", async () => {
    renderPage([{ id: "row-1", label: "العروض", href: "/offers", sort_order: 1, is_active: true }]);
    const hrefInput = await screen.findByDisplayValue("/offers");

    fireEvent.change(hrefInput, { target: { value: "/products?sort=newest" } });
    fireEvent.blur(hrefInput);

    await waitFor(() => {
      expect(updateAdminDesktopQuickLink).toHaveBeenCalledWith("row-1", { href: "/products?sort=newest" });
    });
  });

  it("keeps the valid edited href on screen if the update API call fails — never reverts to the stale value", async () => {
    updateAdminDesktopQuickLink.mockRejectedValueOnce(new Error("network error"));
    renderPage([{ id: "row-1", label: "العروض", href: "/offers", sort_order: 1, is_active: true }]);
    const hrefInput = await screen.findByDisplayValue("/offers");

    fireEvent.change(hrefInput, { target: { value: "/products?sort=newest" } });
    fireEvent.blur(hrefInput);

    await waitFor(() => {
      expect(updateAdminDesktopQuickLink).toHaveBeenCalledWith("row-1", { href: "/products?sort=newest" });
    });
    // The failed update must not silently discard the user's still-valid input.
    expect(await screen.findByDisplayValue("/products?sort=newest")).toBeInTheDocument();
  });

  it("a legacy invalid href stays visible and editable, and editing only the label still updates", async () => {
    const legacyHref = "javascript:eval(atob('ZXZpbA=='))";
    renderPage([{ id: "row-1", label: "قديم", href: legacyHref, sort_order: 1, is_active: true }]);

    const hrefInput = await screen.findByDisplayValue(legacyHref);
    expect(hrefInput).toBeInTheDocument(); // legacy row renders safely, no crash, href visible for editing

    const labelInput = screen.getByDisplayValue("قديم");
    fireEvent.change(labelInput, { target: { value: "جديد" } });
    fireEvent.blur(labelInput);

    await waitFor(() => {
      expect(updateAdminDesktopQuickLink).toHaveBeenCalledWith("row-1", { label: "جديد" });
    });
    // The unrelated label-only update must never smuggle the still-invalid href into the payload.
    expect(updateAdminDesktopQuickLink).not.toHaveBeenCalledWith("row-1", expect.objectContaining({ href: expect.anything() }));
  });
});
