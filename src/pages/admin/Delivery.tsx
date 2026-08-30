import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Truck, Plus, Edit, Coins, Save, RefreshCw, MapPin } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { apiClient } from "@/lib/api-client";

export default function AdminDelivery() {
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<any>(null);
    const [isPriceOpen, setIsPriceOpen] = useState(false);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    const queryClient = useQueryClient();

    // Fetch Companies
    const { data: companies, isLoading } = useQuery({
        queryKey: ["delivery-companies"],
        queryFn: () => apiClient.getDeliveryCompanies(),
    });

    // Fetch Governorates
    const { data: governorates } = useQuery({
        queryKey: ["governorates"],
        queryFn: () => apiClient.getShippingGovernorates(),
    });

    // Fetch Prices for selected company
    const { data: prices, refetch: refetchPrices } = useQuery({
        queryKey: ["delivery-prices", selectedCompanyId],
        queryFn: async () => {
            if (!selectedCompanyId) return [];
            return apiClient.getCompanyDeliveryPrices(selectedCompanyId);
        },
        enabled: !!selectedCompanyId
    });

    const createCompany = useMutation({
        mutationFn: (data: { name: string, phone: string }) => apiClient.createDeliveryCompany(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["delivery-companies"] });
            setIsAddOpen(false);
            toast.success("تمت إضافة شركة التوصيل");
        },
    });

    const updatePrice = useMutation({
        mutationFn: async ({ governorateId, price }: { governorateId: string, price: number }) => {
            if (!selectedCompanyId) return;
            await apiClient.upsertCompanyDeliveryPrice(selectedCompanyId, {
                governorate_id: governorateId,
                price,
            });
        },
        onSuccess: () => {
            refetchPrices();
            toast.success("تم تحديث السعر");
        }
    });

    const [tempPrices, setTempPrices] = useState<Record<string, number>>({});
    const [policyDrafts, setPolicyDrafts] = useState<
      Record<
        string,
        {
          cod_remittance_mode: "gross_remittance" | "net_remittance";
          allow_courier_fee_offset: boolean;
          default_remittance_cycle: "daily" | "weekly" | "custom";
          remittance_notes: string;
        }
      >
    >({});

    const syncJenniReference = useMutation({
        mutationFn: (payload: { dry_run?: boolean; sync_cities?: boolean }) =>
            apiClient.syncJenniReferenceData(payload),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ["governorates"] });
            queryClient.invalidateQueries({ queryKey: ["delivery-companies"] });
            if (selectedCompanyId) {
                queryClient.invalidateQueries({ queryKey: ["delivery-prices", selectedCompanyId] });
            }
            const matched = result.matched_count ?? 0;
            const unmatchedLocal = result.unmatched_local_count ?? 0;
            toast.success(
                result.dry_run
                    ? `معاينة: ${matched} محافظة متطابقة، ${unmatchedLocal} غير متطابقة محلياً`
                    : `تمت المزامنة: ${matched} محافظة، ${result.prices_upserted_to_jenni_company ?? 0} تعرفة`,
            );
        },
        onError: (err: Error) => toast.error(err.message || "فشلت مزامنة Jenni"),
    });

    const updatePolicy = useMutation({
        mutationFn: async ({
            companyId,
            payload,
        }: {
            companyId: string;
            payload: {
                cod_remittance_mode: "gross_remittance" | "net_remittance";
                allow_courier_fee_offset: boolean;
                default_remittance_cycle: "daily" | "weekly" | "custom";
                remittance_notes?: string | null;
            };
        }) => apiClient.updateDeliveryCompanyPolicy(companyId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["delivery-companies"] });
            toast.success("تم تحديث سياسة توريد الكاش لشركة التوصيل");
        },
    });

    const handlePriceChange = (govId: string, val: string) => {
        setTempPrices(prev => ({ ...prev, [govId]: parseInt(val) || 0 }));
    };

    const savePrice = (govId: string) => {
        const price = tempPrices[govId];
        if (price !== undefined) {
            updatePrice.mutate({ governorateId: govId, price });
        }
    };

    const getPolicyDraft = (company: any) => {
        const existing = policyDrafts[company.id];
        if (existing) return existing;
        return {
            cod_remittance_mode: (company.cod_remittance_mode === "net_remittance" ? "net_remittance" : "gross_remittance") as "gross_remittance" | "net_remittance",
            allow_courier_fee_offset: Boolean(company.allow_courier_fee_offset),
            default_remittance_cycle: (["daily", "weekly", "custom"].includes(company.default_remittance_cycle)
                ? company.default_remittance_cycle
                : "daily") as "daily" | "weekly" | "custom",
            remittance_notes: company.remittance_notes || "",
        };
    };

    const setPolicyDraft = (companyId: string, next: Partial<ReturnType<typeof getPolicyDraft>>) => {
        setPolicyDrafts((prev) => ({
            ...prev,
            [companyId]: {
                ...(prev[companyId] ?? ({} as any)),
                ...next,
            } as any,
        }));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">إعدادات التوصيل</h1>
                    <p className="text-muted-foreground">إدارة شركات التوصيل وأسعار الشحن للمحافظات</p>
                </div>
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus size={16} />
                            إضافة شركة
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>إضافة شركة توصيل جديدة</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={(e: any) => {
                            e.preventDefault();
                            createCompany.mutate({
                                name: e.target.name.value,
                                phone: e.target.phone.value
                            });
                        }} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">اسم الشركة</Label>
                                <Input id="name" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">رقم الهاتف (للتواصل)</Label>
                                <Input id="phone" />
                            </div>
                            <Button type="submit" className="w-full">حفظ</Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {companies?.some((c: any) => c.provider_code === "jenni") ? (
                <Card className="border-primary/30 bg-primary/5 max-w-5xl mx-auto w-full">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-primary" />
                            مزامنة مرجع Jenni (الزعيم)
                        </CardTitle>
                        <CardDescription>
                            يجلب أكواد المحافظات من Jenni ويربطها محلياً، وينسخ أسعار المحافظات الحالية إلى تعرفة Jenni.
                            واجهة Jenni لا تعرض تعرفات الشحن — حدّث الأسعار يدوياً بعد المزامنة إن لزم.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={syncJenniReference.isPending}
                            onClick={() => syncJenniReference.mutate({ dry_run: true })}
                        >
                            <RefreshCw className={`h-4 w-4 ${syncJenniReference.isPending ? "animate-spin" : ""}`} />
                            معاينة المطابقة
                        </Button>
                        <Button
                            size="sm"
                            className="gap-2"
                            disabled={syncJenniReference.isPending}
                            onClick={() => syncJenniReference.mutate({ sync_cities: false })}
                        >
                            مزامنة الأكواد والتعرفات
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={syncJenniReference.isPending}
                            onClick={() => syncJenniReference.mutate({ sync_cities: true })}
                        >
                            + مزامنة المدن (قد تستغرق دقائق)
                        </Button>
                    </CardContent>
                </Card>
            ) : null}

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 max-w-5xl mx-auto w-full">
                <p className="text-sm font-semibold text-amber-800">صلاحية على مستوى المنصة</p>
                <p className="text-xs text-amber-700 mt-1">
                    هذه الإعدادات تُطبّق على مستوى المنصة بالكامل ولا تتاح من بوابة التاجر.
                </p>
            </div>

            <div
                className={
                    (companies?.length ?? 0) <= 1
                        ? "grid grid-cols-1 gap-6 max-w-5xl mx-auto w-full"
                        : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
                }
            >
                {isLoading ? (
                    <div>جاري التحميل...</div>
                ) : companies?.length === 0 ? (
                    <div className="col-span-full text-center py-10 text-muted-foreground">لا توجد شركات توصيل مضافة</div>
                ) : (
                    companies?.map((company) => (
                        (() => {
                            const policyDraft = getPolicyDraft(company);
                            const isJenni = company.provider_code === "jenni";
                            return (
                        <Card key={company.id} className="relative w-full">
                            <CardHeader className="pb-4 border-b border-border/60">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="flex items-start gap-4 min-w-0">
                                        <div className="bg-primary/10 p-3 rounded-xl shrink-0">
                                            <Truck className="h-7 w-7 text-primary" />
                                        </div>
                                        <div className="min-w-0 space-y-1">
                                            <CardTitle className="text-xl">{company.name}</CardTitle>
                                            <CardDescription>{company.phone || "لا يوجد رقم هاتف"}</CardDescription>
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${company.is_active ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                                                    {company.is_active ? "نشط" : "غير نشط"}
                                                </span>
                                                {isJenni ? (
                                                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/15 text-primary">
                                                        مزود خارجي — Jenni
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                    <Dialog open={isPriceOpen && selectedCompanyId === company.id} onOpenChange={(open) => {
                                        setIsPriceOpen(open);
                                        if (!open) setSelectedCompanyId(null);
                                    }}>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" className="gap-2 w-full lg:w-auto shrink-0" onClick={() => setSelectedCompanyId(company.id)}>
                                                <Coins size={16} />
                                                تسعير المحافظات
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                                            <DialogHeader>
                                                <DialogTitle>تحديد أسعار التوصيل - {company.name}</DialogTitle>
                                                <CardDescription>حدد سعر التوصيل لكل محافظة لهذه الشركة</CardDescription>
                                            </DialogHeader>
                                            <div className="py-4 overflow-x-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>المحافظة</TableHead>
                                                            <TableHead>السعر الحالي</TableHead>
                                                            <TableHead>تعديل السعر</TableHead>
                                                            <TableHead></TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {governorates?.map((gov) => {
                                                            const priceObj = prices?.find(p => p.governorate_id === gov.id);
                                                            const currentPrice = priceObj ? priceObj.price : 5000; // Default

                                                            return (
                                                                <TableRow key={gov.id}>
                                                                    <TableCell className="font-medium">{gov.name}</TableCell>
                                                                    <TableCell>{formatPrice(currentPrice)}</TableCell>
                                                                    <TableCell>
                                                                        <Input
                                                                            type="number"
                                                                            placeholder="أدخل السعر"
                                                                            className="w-32 h-8"
                                                                            defaultValue={currentPrice}
                                                                            onChange={(e) => handlePriceChange(gov.id, e.target.value)}
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Button
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            onClick={() => savePrice(gov.id)}
                                                                        >
                                                                            <Save size={16} className="text-primary" />
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="rounded-xl border bg-muted/20 p-4 md:p-6">
                                    <p className="text-sm font-semibold mb-4">سياسة توريد COD (M18)</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                        <div className="space-y-1.5 xl:col-span-1">
                                            <Label className="text-xs text-muted-foreground">Remittance Mode</Label>
                                            <select
                                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                            value={policyDraft.cod_remittance_mode}
                                            onChange={(e) => setPolicyDraft(company.id, { cod_remittance_mode: e.target.value as "gross_remittance" | "net_remittance" })}
                                        >
                                            <option value="gross_remittance">Gross: توريد كامل المبلغ</option>
                                            <option value="net_remittance">Net: خصم أجرة التوصيل وتوريد الصافي</option>
                                        </select>
                                    </div>
                                        <div className="space-y-1.5 xl:col-span-1">
                                            <Label className="text-xs text-muted-foreground">Remittance Cycle</Label>
                                            <select
                                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                            value={policyDraft.default_remittance_cycle}
                                            onChange={(e) => setPolicyDraft(company.id, { default_remittance_cycle: e.target.value as "daily" | "weekly" | "custom" })}
                                        >
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="custom">Custom</option>
                                        </select>
                                    </div>
                                        <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5 md:col-span-2 xl:col-span-1">
                                            <span className="text-sm">Allow courier fee offset</span>
                                        <Switch
                                            checked={policyDraft.allow_courier_fee_offset}
                                            onCheckedChange={(checked) => setPolicyDraft(company.id, { allow_courier_fee_offset: checked })}
                                        />
                                    </div>
                                        <div className="space-y-1.5 md:col-span-2 xl:col-span-4">
                                            <Label className="text-xs text-muted-foreground">Notes</Label>
                                            <Input
                                                className="h-10"
                                                value={policyDraft.remittance_notes}
                                            onChange={(e) => setPolicyDraft(company.id, { remittance_notes: e.target.value })}
                                            placeholder="ملاحظات سياسة التوريد"
                                        />
                                        </div>
                                    </div>
                                    <Button
                                        className="w-full sm:w-auto mt-5 min-w-[200px]"
                                        onClick={() =>
                                            updatePolicy.mutate({
                                                companyId: company.id,
                                                payload: {
                                                    cod_remittance_mode: policyDraft.cod_remittance_mode,
                                                    allow_courier_fee_offset: policyDraft.allow_courier_fee_offset,
                                                    default_remittance_cycle: policyDraft.default_remittance_cycle,
                                                    remittance_notes: policyDraft.remittance_notes || null,
                                                },
                                            })
                                        }
                                        disabled={updatePolicy.isPending}
                                    >
                                        حفظ سياسة M18
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                            );
                        })()
                    ))
                )}
            </div>
        </div>
    );
}
