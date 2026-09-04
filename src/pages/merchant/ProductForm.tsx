import React from "react";
import { useParams } from "react-router-dom";
import AdminProductForm from "@/pages/admin/ProductForm";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";

export function MerchantProductFormSkeleton() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-muted" />
        <div className="h-8 w-48 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-48 rounded-xl bg-muted/60" />
          <div className="h-64 rounded-xl bg-muted/60" />
        </div>
        <div className="space-y-6">
          <div className="h-36 rounded-xl bg-muted/60" />
          <div className="h-52 rounded-xl bg-muted/60" />
        </div>
      </div>
    </div>
  );
}

export default function MerchantProductForm() {
  const { id } = useParams<{ id?: string }>();
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = membership?.merchant_id;

  if (isLoading) {
    return <MerchantProductFormSkeleton />;
  }

  if (!merchantId) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center text-foreground max-w-2xl mx-auto mt-8">
        <p className="text-base font-semibold">لا يوجد متجر نشط مرتبط بحسابك.</p>
        <p className="text-xs text-muted-foreground mt-1">
          اختر متجراً نشطاً من قائمة المتاجر أو تأكد من تفعيل حساب المتجر للمتابعة.
        </p>
      </div>
    );
  }

  // Keyed workspace on active merchantId guarantees instantaneous state reset on store switch
  return <AdminProductForm key={`${merchantId}-${id || "new"}`} />;
}
