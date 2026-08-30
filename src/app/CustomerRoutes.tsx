import { Route } from "react-router-dom";
import { lazy, type ReactElement } from "react";
import Index from "@/pages/Index";
import Storefront from "@/pages/Storefront";
import Products from "@/pages/Products";
import Cart from "@/pages/Cart";
import ProductDetail from "@/pages/ProductDetail";
import Checkout from "@/pages/Checkout";
import ThankYou from "@/pages/ThankYou";
import Privacy from "@/pages/Privacy";
import Support from "@/pages/Support";
import NotFound from "@/pages/NotFound";
import Auth from "@/pages/Auth";
import Profile from "@/pages/Profile";
import Category from "@/pages/Category";
import Stores from "@/pages/Stores";
import Brands from "@/pages/Brands";
import Offers from "@/pages/Offers";
import TrackOrder from "@/pages/TrackOrder";
import Wishlist from "@/pages/Wishlist";
import { RequireAuthenticatedUser } from "@/components/guards/RequireAuthenticatedUser";
import { ProfileRouteGate } from "@/components/guards/ProfileRouteGate";
import { CustomerCapabilityGuard } from "@/lib/auth/CustomerCapabilityGuard";

const OpenHandoff = lazy(() => import("@/pages/OpenHandoff"));
const OpenBarberHandoff = lazy(() => import("@/pages/OpenBarberHandoff"));
const AccountAddresses = lazy(() => import("@/pages/account/Addresses"));
const AccountOrders = lazy(() => import("@/pages/account/Orders"));
const ClaimAccount = lazy(() => import("@/pages/account/ClaimAccount"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const PhoneSecurity = lazy(() => import("@/pages/account/PhoneSecurity"));

/** Customer / public marketplace route elements. No admin/merchant/agent. */
export function getCustomerRouteElements(): ReactElement[] {
  return [
    <Route key="home" path="/" element={<Index />} />,
    // STORE-PR6 §12 — Universal/App Link + web landing for the DilMart customer handoff (customer surface).
    <Route key="open" path="/open" element={<OpenHandoff />} />,
    // Web landing for the Barber/Owner handoff (barber_app surface, separate from Customer).
    <Route key="open-barber" path="/open-barber" element={<OpenBarberHandoff />} />,
    <Route key="store" path="/store/:slug" element={<Storefront />} />,
    <Route key="products" path="/products" element={<Products />} />,
    <Route key="stores" path="/stores" element={<Stores />} />,
    <Route key="brands" path="/brands" element={<Brands />} />,
    <Route key="cart" path="/cart" element={<Cart />} />,
    <Route key="offers" path="/offers" element={<Offers />} />,
    <Route key="product" path="/product/:slug" element={<ProductDetail />} />,
    <Route key="checkout" path="/checkout" element={<Checkout />} />,
    <Route key="thank-you" path="/thank-you" element={<ThankYou />} />,
    <Route
      key="claim-account"
      path="/claim-account"
      element={
        <CustomerCapabilityGuard capability="accountClaim">
          <ClaimAccount />
        </CustomerCapabilityGuard>
      }
    />,
    <Route key="privacy" path="/privacy" element={<Privacy />} />,
    <Route key="support" path="/support" element={<Support />} />,
    <Route key="auth" path="/auth" element={<Auth />} />,
    <Route
      key="forgot-password"
      path="/forgot-password"
      element={
        <CustomerCapabilityGuard capability="passwordManagement">
          <ForgotPassword />
        </CustomerCapabilityGuard>
      }
    />,
    <Route
      key="profile"
      path="/profile"
      element={
        <ProfileRouteGate>
          <RequireAuthenticatedUser>
            <Profile />
          </RequireAuthenticatedUser>
        </ProfileRouteGate>
      }
    />,
    <Route
      key="phone-security"
      path="/profile/security/phone"
      element={
        <RequireAuthenticatedUser>
          <CustomerCapabilityGuard capability="phoneIdentity">
            <PhoneSecurity />
          </CustomerCapabilityGuard>
        </RequireAuthenticatedUser>
      }
    />,
    <Route
      key="addresses"
      path="/my-account/addresses"
      element={
        <RequireAuthenticatedUser>
          <AccountAddresses />
        </RequireAuthenticatedUser>
      }
    />,
    <Route
      key="orders"
      path="/my-account/orders"
      element={
        <RequireAuthenticatedUser>
          <AccountOrders />
        </RequireAuthenticatedUser>
      }
    />,
    <Route key="category" path="/category/:slug" element={<Category />} />,
    <Route key="track-order" path="/track-order" element={<TrackOrder />} />,
    <Route key="wishlist" path="/wishlist" element={<Wishlist />} />,
  ];
}

export function CustomerRoutes() {
  return (
    <>
      {getCustomerRouteElements()}
      <Route path="*" element={<NotFound />} />
    </>
  );
}

/**
 * Full native customer route table: marketplace + explicit NotFound for backoffice paths.
 * Single source of truth for CustomerMobileApp and forbidden-route tests.
 */
export function getCustomerMobileRouteElements(): ReactElement[] {
  return [
    ...getCustomerRouteElements(),
    <Route key="forbid-admin" path="/admin" element={<NotFound />} />,
    <Route key="forbid-admin-splat" path="/admin/*" element={<NotFound />} />,
    <Route key="forbid-merchant" path="/merchant" element={<NotFound />} />,
    <Route key="forbid-merchant-splat" path="/merchant/*" element={<NotFound />} />,
    <Route key="forbid-agent" path="/agent" element={<NotFound />} />,
    <Route key="forbid-agent-splat" path="/agent/*" element={<NotFound />} />,
    <Route key="catch-all" path="*" element={<NotFound />} />,
  ];
}

export const CUSTOMER_ROUTE_PATHS = [
  "/",
  "/store/:slug",
  "/products",
  "/stores",
  "/brands",
  "/cart",
  "/offers",
  "/product/:slug",
  "/checkout",
  "/thank-you",
  "/claim-account",
  "/privacy",
  "/support",
  "/auth",
  "/forgot-password",
  "/profile",
  "/my-account/addresses",
  "/my-account/orders",
  "/category/:slug",
  "/track-order",
  "/wishlist",
] as const;
