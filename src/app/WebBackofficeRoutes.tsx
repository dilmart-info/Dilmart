import { Route, Navigate } from "react-router-dom";
import { lazy, type ReactElement } from "react";
import AgentOrders from "@/pages/AgentOrders";
import {
  RequireAgent,
  RequireMerchantUser,
  RequirePlatformAdmin,
} from "@/components/guards/BackofficeRouteGuards";

const AdminLogin = lazy(() => import("@/pages/admin/Login"));
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AdminExecutive = lazy(() => import("@/pages/admin/Executive"));
const AdminReconciliation = lazy(() => import("@/pages/admin/Reconciliation"));
const FinanceLayout = lazy(() => import("@/pages/admin/finance/FinanceLayout"));
const FinanceOverview = lazy(() => import("@/pages/admin/finance/FinanceOverview"));
const FinanceOrders = lazy(() => import("@/pages/admin/finance/FinanceOrders"));
const FinanceMerchants = lazy(() => import("@/pages/admin/finance/FinanceMerchants"));
const FinanceCouriers = lazy(() => import("@/pages/admin/finance/FinanceCouriers"));
const FinancePayouts = lazy(() => import("@/pages/admin/finance/FinancePayouts"));
const FinanceAdjustments = lazy(() => import("@/pages/admin/finance/FinanceAdjustments"));
const FinanceReversals = lazy(() => import("@/pages/admin/finance/FinanceReversals"));
const FinanceEvents = lazy(() => import("@/pages/admin/finance/FinanceEvents"));
const AdminOrders = lazy(() => import("@/pages/admin/Orders"));
const AdminOrderDetail = lazy(() => import("@/pages/admin/OrderDetail"));
const AdminProducts = lazy(() => import("@/pages/admin/Products"));
const AdminProductForm = lazy(() => import("@/pages/admin/ProductForm"));
const AdminCategories = lazy(() => import("@/pages/admin/Categories"));
const AdminInventory = lazy(() => import("@/pages/admin/Inventory"));
const AdminDelivery = lazy(() => import("@/pages/admin/Delivery"));
const AdminDeliveryOps = lazy(() => import("@/pages/admin/DeliveryOps"));
const AdminDeliveryIntelligence = lazy(() => import("@/pages/admin/DeliveryIntelligence"));
const AdminJenniIntegration = lazy(() => import("@/pages/admin/JenniIntegration"));
const AdminCoupons = lazy(() => import("@/pages/admin/Coupons"));
const AdminAgents = lazy(() => import("@/pages/admin/Agents"));
const AdminUsers = lazy(() => import("@/pages/admin/Users"));
const AdminLoyalty = lazy(() => import("@/pages/admin/Loyalty"));
const AdminDesktopQuickLinks = lazy(() => import("@/pages/admin/DesktopQuickLinks"));
const AdminMerchants = lazy(() => import("@/pages/admin/Merchants"));
const AdminMerchantCreate = lazy(() => import("@/pages/admin/MerchantCreate"));
const AdminMerchantDetail = lazy(() => import("@/pages/admin/MerchantDetail"));
const AdminMerchantCommercialAgreement = lazy(() => import("@/pages/admin/MerchantCommercialAgreement"));
const AdminMerchantPlans = lazy(() => import("@/pages/admin/MerchantPlans"));
const AdminMerchantPlanAssignments = lazy(() => import("@/pages/admin/MerchantPlanAssignments"));
const AdminCommercialRules = lazy(() => import("@/pages/admin/CommercialRules"));
const AdminLayout = lazy(() => import("@/components/AdminLayout"));
const MerchantLayout = lazy(() => import("@/components/MerchantLayout"));
const MerchantLogin = lazy(() => import("@/pages/merchant/Login"));
const MerchantRegister = lazy(() => import("@/pages/merchant/Register"));
const MerchantPending = lazy(() => import("@/pages/merchant/Pending"));
const MerchantOverview = lazy(() => import("@/pages/merchant/Overview"));
const MerchantProducts = lazy(() => import("@/pages/merchant/Products"));
const MerchantProductImport = lazy(() => import("@/pages/merchant/ProductImport"));
const MerchantOrders = lazy(() => import("@/pages/merchant/Orders"));
const MerchantFinance = lazy(() => import("@/pages/merchant/Finance"));
const MerchantOrderDetail = lazy(() => import("@/pages/merchant/OrderDetail"));
const MerchantSettings = lazy(() => import("@/pages/merchant/Settings"));
const MerchantCoupons = lazy(() => import("@/pages/merchant/Coupons"));
const MerchantCustomers = lazy(() => import("@/pages/merchant/Customers"));
const MerchantProductForm = lazy(() => import("@/pages/merchant/ProductForm"));

/**
 * Admin / Merchant / Agent route elements for Web only.
 * Must never be imported from the mobile entrypoint.
 */
export function getWebBackofficeRouteElements(): ReactElement[] {
  return [
    <Route key="admin-login" path="/admin/login" element={<AdminLogin />} />,
    <Route key="admin" path="/admin" element={<RequirePlatformAdmin><AdminLayout><AdminDashboard /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-executive" path="/admin/executive" element={<RequirePlatformAdmin><AdminLayout><AdminExecutive /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-reconciliation" path="/admin/reconciliation" element={<RequirePlatformAdmin><AdminLayout><AdminReconciliation /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-finance-reconciliation" path="/admin/finance-reconciliation" element={<Navigate to="/admin/finance" replace />} />,
    <Route key="admin-finance" path="/admin/finance" element={<RequirePlatformAdmin><AdminLayout><FinanceLayout><FinanceOverview /></FinanceLayout></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-finance-orders" path="/admin/finance/orders" element={<RequirePlatformAdmin><AdminLayout><FinanceLayout><FinanceOrders /></FinanceLayout></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-finance-merchants" path="/admin/finance/merchants" element={<RequirePlatformAdmin><AdminLayout><FinanceLayout><FinanceMerchants /></FinanceLayout></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-finance-couriers" path="/admin/finance/couriers" element={<RequirePlatformAdmin><AdminLayout><FinanceLayout><FinanceCouriers /></FinanceLayout></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-finance-payouts" path="/admin/finance/payouts" element={<RequirePlatformAdmin><AdminLayout><FinanceLayout><FinancePayouts /></FinanceLayout></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-finance-adjustments" path="/admin/finance/adjustments" element={<RequirePlatformAdmin><AdminLayout><FinanceLayout><FinanceAdjustments /></FinanceLayout></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-finance-reversals" path="/admin/finance/reversals" element={<RequirePlatformAdmin><AdminLayout><FinanceLayout><FinanceReversals /></FinanceLayout></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-finance-events" path="/admin/finance/events" element={<RequirePlatformAdmin><AdminLayout><FinanceLayout><FinanceEvents /></FinanceLayout></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-orders" path="/admin/orders" element={<RequirePlatformAdmin><AdminLayout><AdminOrders /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-order-detail" path="/admin/orders/:id" element={<RequirePlatformAdmin><AdminLayout><AdminOrderDetail /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-products" path="/admin/products" element={<RequirePlatformAdmin><AdminLayout><AdminProducts /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-products-new" path="/admin/products/new" element={<RequirePlatformAdmin><AdminLayout><AdminProductForm /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-products-edit" path="/admin/products/:id/edit" element={<RequirePlatformAdmin><AdminLayout><AdminProductForm /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-categories" path="/admin/categories" element={<RequirePlatformAdmin><AdminLayout><AdminCategories /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-inventory" path="/admin/inventory" element={<RequirePlatformAdmin><AdminLayout><AdminInventory /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-delivery" path="/admin/delivery" element={<RequirePlatformAdmin><AdminLayout><AdminDelivery /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-delivery-ops" path="/admin/delivery-ops" element={<RequirePlatformAdmin><AdminLayout><AdminDeliveryOps /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-delivery-intelligence" path="/admin/delivery-intelligence" element={<RequirePlatformAdmin><AdminLayout><AdminDeliveryIntelligence /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-jenni" path="/admin/integrations/jenni" element={<RequirePlatformAdmin><AdminLayout><AdminJenniIntegration /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-coupons" path="/admin/coupons" element={<RequirePlatformAdmin><AdminLayout><AdminCoupons /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-agents" path="/admin/agents" element={<RequirePlatformAdmin><AdminLayout><AdminAgents /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-merchants" path="/admin/merchants" element={<RequirePlatformAdmin><AdminLayout><AdminMerchants /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-merchants-new" path="/admin/merchants/new" element={<RequirePlatformAdmin><AdminLayout><AdminMerchantCreate /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-merchants-detail" path="/admin/merchants/:id" element={<RequirePlatformAdmin><AdminLayout><AdminMerchantDetail /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-merchants-commercial-agreement" path="/admin/merchants/:id/commercial-agreement" element={<RequirePlatformAdmin><AdminLayout><AdminMerchantCommercialAgreement /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-users" path="/admin/users" element={<RequirePlatformAdmin><AdminLayout><AdminUsers /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-loyalty" path="/admin/loyalty" element={<RequirePlatformAdmin><AdminLayout><AdminLoyalty /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-desktop-quick-links" path="/admin/desktop-quick-links" element={<RequirePlatformAdmin><AdminLayout><AdminDesktopQuickLinks /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-merchant-plans" path="/admin/merchant-plans" element={<RequirePlatformAdmin><AdminLayout><AdminMerchantPlans /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-merchant-plan-assignments" path="/admin/merchant-plan-assignments" element={<RequirePlatformAdmin><AdminLayout><AdminMerchantPlanAssignments /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="admin-commercial-rules" path="/admin/commercial-rules" element={<RequirePlatformAdmin><AdminLayout><AdminCommercialRules /></AdminLayout></RequirePlatformAdmin>} />,
    <Route key="agent-orders" path="/agent/orders" element={<RequireAgent><AgentOrders /></RequireAgent>} />,
    <Route key="merchant-login" path="/merchant/login" element={<MerchantLogin />} />,
    <Route key="merchant-register" path="/merchant/register" element={<MerchantRegister />} />,
    <Route key="merchant-pending" path="/merchant/pending" element={<MerchantPending />} />,
    <Route key="merchant" path="/merchant" element={<RequireMerchantUser><MerchantLayout><MerchantOverview /></MerchantLayout></RequireMerchantUser>} />,
    <Route key="merchant-slash" path="/merchant/" element={<RequireMerchantUser><MerchantLayout><MerchantOverview /></MerchantLayout></RequireMerchantUser>} />,
    <Route key="merchant-products" path="/merchant/products" element={<RequireMerchantUser><MerchantLayout><MerchantProducts /></MerchantLayout></RequireMerchantUser>} />,
    <Route key="merchant-products-import" path="/merchant/products/import" element={<RequireMerchantUser><MerchantLayout><MerchantProductImport /></MerchantLayout></RequireMerchantUser>} />,
    <Route key="merchant-products-new" path="/merchant/products/new" element={<RequireMerchantUser><MerchantLayout><MerchantProductForm /></MerchantLayout></RequireMerchantUser>} />,
    <Route key="merchant-products-edit" path="/merchant/products/:id/edit" element={<RequireMerchantUser><MerchantLayout><MerchantProductForm /></MerchantLayout></RequireMerchantUser>} />,
    <Route key="merchant-orders" path="/merchant/orders" element={<RequireMerchantUser><MerchantLayout><MerchantOrders /></MerchantLayout></RequireMerchantUser>} />,
    <Route key="merchant-finance" path="/merchant/finance" element={<RequireMerchantUser><MerchantLayout><MerchantFinance /></MerchantLayout></RequireMerchantUser>} />,
    <Route key="merchant-order-detail" path="/merchant/orders/:id" element={<RequireMerchantUser><MerchantLayout><MerchantOrderDetail /></MerchantLayout></RequireMerchantUser>} />,
    <Route key="merchant-coupons" path="/merchant/coupons" element={<RequireMerchantUser><MerchantLayout><MerchantCoupons /></MerchantLayout></RequireMerchantUser>} />,
    <Route key="merchant-customers" path="/merchant/customers" element={<RequireMerchantUser><MerchantLayout><MerchantCustomers /></MerchantLayout></RequireMerchantUser>} />,
    <Route key="merchant-settings" path="/merchant/settings" element={<RequireMerchantUser><MerchantLayout><MerchantSettings /></MerchantLayout></RequireMerchantUser>} />,
  ];
}

export const WEB_BACKOFFICE_ROUTE_PATHS = [
  "/admin/login",
  "/admin",
  "/merchant/login",
  "/merchant",
  "/agent/orders",
] as const;
