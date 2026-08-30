import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AUTH_STORAGE_ERROR_MESSAGE_AR,
  AUTH_STORAGE_ERROR_RETRY_AR,
  AUTH_STORAGE_ERROR_TITLE_AR,
} from "@/lib/auth/auth-errors";

type Props = {
  onRetry: () => Promise<void> | void;
};

/** Shown when encrypted auth storage cannot be opened. Arabic, RTL, mobile-first. */
export function AuthStorageErrorScreen({ onRetry }: Props) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-foreground">{AUTH_STORAGE_ERROR_TITLE_AR}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{AUTH_STORAGE_ERROR_MESSAGE_AR}</p>
        <Button className="w-full" onClick={handleRetry} disabled={retrying}>
          {retrying ? "جاري إعادة المحاولة..." : AUTH_STORAGE_ERROR_RETRY_AR}
        </Button>
      </div>
    </div>
  );
}

export default AuthStorageErrorScreen;
