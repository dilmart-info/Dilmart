import { customerApi }     from "@/lib/api/customer";
import { checkoutApi }     from "@/lib/api/checkout";
import { ordersApi }       from "@/lib/api/orders";
import { productsApi }     from "@/lib/api/products";
import { merchantApi }     from "@/lib/api/merchant";
import { shippingApi }     from "@/lib/api/shipping";
import { analyticsApi }    from "@/lib/api/analytics";
import { whatsappApi }     from "@/lib/api/whatsapp";
import { adminCoreApi }    from "@/lib/api/admin-core";
import { adminFinanceApi } from "@/lib/api/admin-finance";
import { adminOrdersApi }  from "@/lib/api/admin-orders";
import { marketplaceApi }  from "@/lib/api/marketplace";
import { authSessionManager } from "@/lib/auth/auth-session-manager";
import { API_BASE_URL }    from "@/lib/api-core";
import { toast }           from "sonner";

export const apiClient = {
  ...customerApi,
  ...checkoutApi,
  ...ordersApi,
  ...productsApi,
  ...merchantApi,
  ...shippingApi,
  ...analyticsApi,
  ...whatsappApi,
  ...adminCoreApi,
  ...adminFinanceApi,
  ...adminOrdersApi,
  ...marketplaceApi,

  // Aliases — resolved directly against their slice (no self-reference)
  markOrderCashCollected:      adminOrdersApi.markAdminOrderCollected,
  markOrderRemittedToPlatform: adminOrdersApi.markAdminOrderRemittedToPlatform,
  markOrderRemittedToMerchant: adminOrdersApi.markAdminOrderRemittedToMerchant,
  settleOrderCourier:          adminOrdersApi.settleAdminOrderCourier,
  markOrderAsDisputed:         adminOrdersApi.markAdminOrderFinanceDispute,

  async downloadJenniSticker(orderId: string) {
    try {
      const accessToken = (await authSessionManager.getValidAccessToken()) ?? "";

      const response = await fetch(`${API_BASE_URL}/orders/${orderId}/jenni-sticker`, {
        method: "GET",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        let msg = `فشل تحميل الملصق (الحالة ${response.status})`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.message) msg = parsed.message;
        } catch {
          if (errorText.trim()) msg = errorText.trim();
        }
        throw new Error(msg);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        const link = document.createElement("a");
        link.href = url;
        link.download = `jenni-sticker-${orderId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      toast.error(err.message ?? "حدث خطأ أثناء تحميل الملصق");
    }
  },
};
