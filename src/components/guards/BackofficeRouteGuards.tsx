import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { AuthStorageErrorScreen } from "@/components/auth/AuthStorageErrorScreen";
import type { AuthStatus } from "@/hooks/use-auth";

type GuardProps = {
  children: React.ReactNode;
};

const CHECKING_SESSION_LABEL = "جاري التحقق من الجلسة والصلاحيات...";

/** True while the guard still cannot make a decision. */
function isResolvingSession(authStatus: AuthStatus, contextLoading: boolean): boolean {
  if (authStatus === "bootstrapping") return true;
  if (authStatus === "authenticated_offline") return false;
  return authStatus === "authenticated_loading_context" || contextLoading;
}

/** Offline sessions keep route access; role checks still run against cached context. */
function hasLiveSession(authStatus: AuthStatus, user: unknown, session: unknown): boolean {
  if (authStatus === "unauthenticated") return false;
  if (authStatus === "authenticated_offline") return !!(user || session);
  return !!user;
}

export function RequirePlatformAdmin({ children }: GuardProps) {
  const { user, session, isAdmin, authStatus, contextLoading, retryStorageBootstrap } = useAuth();
  const location = useLocation();

  if (authStatus === "storage_error") {
    return <AuthStorageErrorScreen onRetry={retryStorageBootstrap} />;
  }

  if (isResolvingSession(authStatus, contextLoading)) {
    return <div className="flex min-h-screen items-center justify-center">{CHECKING_SESSION_LABEL}</div>;
  }

  if (!hasLiveSession(authStatus, user, session)) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function RequireMerchantUser({ children }: GuardProps) {
  const {
    user,
    session,
    isMerchantUser,
    isMerchantApplicant,
    context,
    authStatus,
    contextLoading,
    retryStorageBootstrap,
  } = useAuth();
  const merchantStatus = context?.merchant?.status ?? null;
  const allMemberships = context?.merchant_memberships ?? [];
  const hasActiveMerchant = merchantStatus === "active" || allMemberships.some((m) => m.status === "active");

  if (authStatus === "storage_error") {
    return <AuthStorageErrorScreen onRetry={retryStorageBootstrap} />;
  }

  if (isResolvingSession(authStatus, contextLoading)) {
    return <div className="flex min-h-screen items-center justify-center">{CHECKING_SESSION_LABEL}</div>;
  }

  if (!hasLiveSession(authStatus, user, session)) {
    return <Navigate to="/merchant/login" replace />;
  }

  // Active merchant: allow access immediately (breaks the pending redirect loop)
  if (hasActiveMerchant) {
    return <>{children}</>;
  }

  if (!isMerchantUser && !isMerchantApplicant) {
    return <Navigate to="/merchant/register" replace />;
  }

  // Suspended merchant state
  const isSuspended =
    merchantStatus === "suspended" ||
    (allMemberships.length > 0 && allMemberships.every((m) => m.status === "suspended"));
  if (isSuspended) {
    return <Navigate to="/merchant/pending?status=suspended" replace />;
  }

  // Pending review, rejected, or general applicant
  return <Navigate to="/merchant/pending" replace />;
}

export function RequireAgent({ children }: GuardProps) {
  const { user, session, isAgent, authStatus, contextLoading, retryStorageBootstrap } = useAuth();

  if (authStatus === "storage_error") {
    return <AuthStorageErrorScreen onRetry={retryStorageBootstrap} />;
  }

  if (isResolvingSession(authStatus, contextLoading)) {
    return <div className="flex min-h-screen items-center justify-center">{CHECKING_SESSION_LABEL}</div>;
  }

  if (!hasLiveSession(authStatus, user, session)) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAgent) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
