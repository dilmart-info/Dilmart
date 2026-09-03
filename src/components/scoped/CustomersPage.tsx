import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronRight, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ScopedContext } from "@/lib/scoped-queries";
import { getScopedCustomers } from "@/lib/scoped-queries";

// eslint-disable-next-line react-refresh/only-export-components
export function assertCustomersContractMerchantId(response: unknown, expectedMerchantId: string): void {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("استجابة غير صالحة من الخادم لعملاء المتجر.");
  }
  const r = response as Record<string, unknown>;
  if (r.merchant_id !== expectedMerchantId) {
    throw new Error(`خرق عقد أمان المتجر: المتجر المستلم '${r.merchant_id}' لا يطابق المطلوب '${expectedMerchantId}'.`);
  }
  if (!Array.isArray(r.items)) {
    throw new Error("استجابة غير صالحة: قائمة العملاء مفقودة.");
  }
}

const PAGE_SIZE = 50;

type Props = {
  context: ScopedContext;
  title?: string;
  liveMerchantIdRef?: React.RefObject<string | undefined>;
};

/** Merchant customer row from RPC (masked, no PII) */
type MerchantCustomer = {
  customer_ref: string;
  phone_masked: string;
  orders: number;
  spent: number;
  last_order_at: string;
};

/** Admin/platform customer row (profiles table) */
type PlatformCustomer = {
  id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  role: string;
  created_at: string;
};

type PaginatedResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export default function CustomersPage({ context, title = "العملاء", liveMerchantIdRef }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: response, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["scoped-customers", context.scope, context.merchantId, search, page],
    queryFn: async () => {
      const res = await getScopedCustomers(context, { search, page, limit: PAGE_SIZE });
      if (context.scope === "merchant") {
        assertCustomersContractMerchantId(res, context.merchantId!);
      }
      return res;
    },
  });

  // Separate data adapters: strict contract for merchant, backward-compat for platform
  let paginated: PaginatedResponse<MerchantCustomer | PlatformCustomer>;
  if (context.scope === "merchant") {
    const r = response as {
      merchant_id?: string;
      items?: MerchantCustomer[];
      page?: number;
      limit?: number;
      total?: number;
      hasMore?: boolean;
    } | undefined;
    paginated = {
      items: r?.items ?? [],
      page: r?.page ?? 1,
      limit: r?.limit ?? PAGE_SIZE,
      total: r?.total ?? 0,
      hasMore: r?.hasMore ?? false,
    };
  } else {
    // Platform adapter (preserves legacy array or object support for admin)
    paginated = (Array.isArray(response)
      ? { items: response, page: 1, limit: PAGE_SIZE, total: response.length, hasMore: false }
      : response ?? { items: [], page: 1, limit: PAGE_SIZE, total: 0, hasMore: false }
    ) as PaginatedResponse<PlatformCustomer>;
  }

  const items = paginated.items ?? [];
  const total = paginated.total ?? 0;
  const hasMore = paginated.hasMore ?? false;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const isMerchant = context.scope === "merchant";
  const colSpan = isMerchant ? 4 : 3;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="relative md:w-80">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pr-9" placeholder="بحث عن عميل..." value={search} onChange={(e) => handleSearchChange(e.target.value)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">{isMerchant ? "مرجع العميل" : "الاسم"}</TableHead>
              <TableHead className="text-right">{isMerchant ? "الهاتف (مخفي)" : "الهاتف"}</TableHead>
              {isMerchant ? (
                <>
                  <TableHead className="text-right">عدد الطلبات</TableHead>
                  <TableHead className="text-right">إجمالي الإنفاق</TableHead>
                </>
              ) : (
                <TableHead className="text-right">الدور</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-destructive">
                  <div className="space-y-2">
                    <p>تعذر تحميل بيانات العملاء.</p>
                    <p className="text-xs text-muted-foreground">
                      {error instanceof Error ? error.message : "حدث خطأ غير متوقع أثناء جلب البيانات."}
                    </p>
                    <button
                      type="button"
                      className="rounded border px-3 py-1 text-xs text-foreground hover:bg-muted"
                      onClick={() => refetch()}
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                  لا توجد بيانات عملاء.
                </TableCell>
              </TableRow>
            ) : isMerchant ? (
              (items as MerchantCustomer[]).map((c, idx) => (
                <TableRow key={`${c.customer_ref}-${idx}`}>
                  <TableCell>{c.customer_ref}</TableCell>
                  <TableCell className="font-mono text-sm">{c.phone_masked}</TableCell>
                  <TableCell>{c.orders ?? 0}</TableCell>
                  <TableCell>{Number(c.spent ?? 0).toLocaleString("ar-IQ")} د.ع</TableCell>
                </TableRow>
              ))
            ) : (
              (items as PlatformCustomer[]).map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.full_name ?? "—"}</TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell>{c.role}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination Controls ── */}
      {!isLoading && !isError && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            عرض {from} – {to} من {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronRight className="h-4 w-4" />
              السابق
            </Button>
            <span className="min-w-[3rem] text-center font-medium">
              {page}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              التالي
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
