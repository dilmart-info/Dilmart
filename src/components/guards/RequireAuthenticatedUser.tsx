import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { AuthStorageErrorScreen } from "@/components/auth/AuthStorageErrorScreen";
import { Button } from "@/components/ui/button";

type GuardProps = {
  children: React.ReactNode;
};

export function RequireAuthenticatedUser({ children }: GuardProps) {
  const {
    appSession,
    authStatus,
    contextLoading,
    bootstrapDelayed,
    retryStorageBootstrap,
  } = useAuth();
  const location = useLocation();
  // STORE-PR5 §Phase J — authentication is source-neutral: a federated customer has appSession != null but
  // session (Supabase) == null. Gating on the raw Supabase session would wrongly redirect federated users
  // to /auth, so every check below uses appSession.

  if (authStatus === "storage_error") {
    return <AuthStorageErrorScreen onRetry={retryStorageBootstrap} />;
  }

  if (authStatus === "bootstrapping") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p>جاري التحقق من الجلسة...</p>
        {bootstrapDelayed ? (
          <>
            <p className="text-sm text-muted-foreground">
              تهيئة الجلسة تستغرق وقتًا أطول من المعتاد…
            </p>
            <Button type="button" variant="outline" onClick={() => void retryStorageBootstrap()}>
              إعادة المحاولة
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  // Offline with a persisted session must render before any contextLoading check.
  if (authStatus === "authenticated_offline" && appSession) {
    return <>{children}</>;
  }

  if (authStatus === "authenticated_loading_context" || contextLoading) {
    return <div className="flex min-h-screen items-center justify-center">جاري التحقق من الجلسة...</div>;
  }

  if (authStatus === "unauthenticated" || !appSession) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
