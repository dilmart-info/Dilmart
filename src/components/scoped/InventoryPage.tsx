import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ScopedContext } from "@/lib/scoped-queries";
import { apiClient } from "@/lib/api-client";

type Props = {
  context: ScopedContext;
  title?: string;
};

export default function InventoryPage({ context, title = "المخزون" }: Props) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ["scoped-inventory", context.scope, context.merchantId, search],
    queryFn: () =>
      apiClient.getInventory({
        search,
        merchant_id: context.scope === "merchant" ? context.merchantId : undefined,
      }),
  });

  const adjustStock = useMutation({
    mutationFn: async ({ productId, delta }: { productId: string; delta: number }) =>
      apiClient.adjustInventory({
        product_id: productId,
        delta,
        merchant_id: context.scope === "merchant" ? context.merchantId : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scoped-inventory", context.scope, context.merchantId, search] });
    },
    onError: () => toast.error("تعذّر تحديث المخزون"),
  });

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="relative md:w-80">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pr-9" placeholder="بحث عن منتج..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {context.scope === "platform" ? <TableHead className="text-right">التاجر</TableHead> : null}
              <TableHead className="text-right">المنتج</TableHead>
              <TableHead className="text-right">المخزون</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={context.scope === "platform" ? 4 : 3} className="py-10 text-center text-muted-foreground">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            ) : (products ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={context.scope === "platform" ? 4 : 3} className="py-10 text-center text-muted-foreground">
                  لا توجد بيانات مخزون.
                </TableCell>
              </TableRow>
            ) : (
              (products ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  {context.scope === "platform" ? (
                    <TableCell className="text-muted-foreground">
                      {p.merchants?.display_name ?? "غير محدد"}
                    </TableCell>
                  ) : null}
                  <TableCell>{p.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => adjustStock.mutate({ productId: p.id, delta: -1 })}
                        disabled={adjustStock.isPending}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="min-w-8 text-center">{p.stock ?? 0}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => adjustStock.mutate({ productId: p.id, delta: 1 })}
                        disabled={adjustStock.isPending}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {Number(p.stock ?? 0) <= 0 ? (
                      <Badge variant="destructive">نفذ</Badge>
                    ) : Number(p.stock ?? 0) <= Number(p.low_stock_threshold ?? 5) ? (
                      <Badge variant="secondary">منخفض</Badge>
                    ) : (
                      <Badge variant="default">متوفر</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
