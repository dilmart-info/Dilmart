import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense, type ReactNode } from "react";
import FlyingCartAnimation from "@/components/FlyingCartAnimation";
import { NotificationHub } from "@/components/NotificationHub";
import CapacitorAppWrapper from "@/components/CapacitorAppWrapper";
import ReentryTrackingHub from "@/components/ReentryTrackingHub";
import BottomNav from "@/components/BottomNav";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { BarberWebSessionProvider } from "@/lib/barber-handoff/BarberWebSessionContext";

type AppProvidersProps = {
  children: ReactNode;
  /** When true, wrap children with Capacitor native chrome (Back, offline, external links). */
  withCapacitorChrome?: boolean;
};

/**
 * Shared providers for Web and Customer Mobile surfaces.
 * Must not import Admin/Merchant/Agent modules.
 */
export function AppProviders({ children, withCapacitorChrome = true }: AppProvidersProps) {
  const body = (
    <>
      <NotificationHub />
      <ReentryTrackingHub />
      <Suspense fallback={<div className="min-h-[30vh] p-6 text-center text-sm text-muted-foreground">Loading...</div>}>
        {children}
      </Suspense>
      <BottomNav />
    </>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BarberWebSessionProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <FlyingCartAnimation />
            {withCapacitorChrome ? <CapacitorAppWrapper>{body}</CapacitorAppWrapper> : body}
          </TooltipProvider>
        </BarberWebSessionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
