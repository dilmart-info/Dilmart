import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AuthPageShellProps {
  children: React.ReactNode;
  cardClassName?: string;
  maxWidth?: "sm" | "md" | "lg";
}

export default function AuthPageShell({
  children,
  cardClassName,
  maxWidth = "md",
}: AuthPageShellProps) {
  const maxWidthClass =
    maxWidth === "sm" ? "max-w-sm" : maxWidth === "lg" ? "max-w-xl" : "max-w-md";

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 md:py-16 flex items-center justify-center">
        <Card
          className={cn(
            "w-full rounded-2xl border border-border/80 bg-card p-6 md:p-8 shadow-sm transition-all animate-fade-in",
            maxWidthClass,
            cardClassName
          )}
        >
          {children}
        </Card>
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
