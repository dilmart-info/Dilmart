import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, RefreshCcw, Coins, Settings2, Info } from "lucide-react";

export default function AdminLoyalty() {
    const queryClient = useQueryClient();
    const [isSaving, setIsSaving] = useState(false);

    const { data: settings, isLoading } = useQuery({
        queryKey: ["admin-loyalty-settings"],
        queryFn: () => apiClient.getAdminLoyaltySettings()
    });

    const updateMutation = useMutation({
        mutationFn: async (payload: any) => {
            await apiClient.updateAdminLoyaltySettings(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-loyalty-settings"] });
            toast.success("تم تحديث إعدادات الولاء بنجاح");
        },
        onError: (err: any) => toast.error(err.message || "حدث خطأ أثناء التحديث")
    });

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        updateMutation.mutate({
            points_per_dinar: parseFloat(formData.get("points_per_dinar") as string),
            dinar_per_point: parseFloat(formData.get("dinar_per_point") as string),
            min_spend_to_redeem: parseFloat(formData.get("min_spend_to_redeem") as string),
            points_expiry_days: parseInt(formData.get("points_expiry_days") as string),
            is_active: (settings as any).is_active
        });
    };

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">جاري تحميل الإعدادات...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-amber-100 p-2 rounded-lg">
                        <Coins className="text-amber-600" size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">إعدادات نظام الولاء</h2>
                        <p className="text-sm text-muted-foreground">تحكم في كيفية اكتساب واستبدال النقاط في المتجر</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Label htmlFor="loyalty-active" className="text-sm font-medium">حالة النظام:</Label>
                    <Switch
                        id="loyalty-active"
                        checked={(settings as any)?.is_active}
                        onCheckedChange={(val) => updateMutation.mutate({ is_active: val })}
                    />
                </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800">صلاحية على مستوى المنصة</p>
                <p className="text-xs text-amber-700 mt-1">
                    إعدادات الولاء هنا مركزية للمنصة وتؤثر على جميع المتاجر؛ التاجر لا يعدّل هذه القواعد من بوابته.
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Earning Rules */}
                    <Card className="border-primary/10 shadow-sm">
                        <CardHeader className="bg-primary/5">
                            <CardTitle className="text-md flex items-center gap-2">
                                <Settings2 size={18} className="text-primary" />
                                قواعد الاكتساب
                            </CardTitle>
                            <CardDescription>كم نقطة يحصل عليها الزبون عند الشراء</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="space-y-2">
                                <Label>عدد النقاط لكل 1000 دينار</Label>
                                <Input
                                    name="points_per_dinar"
                                    type="number"
                                    step="0.1"
                                    defaultValue={(settings as any)?.points_per_dinar}
                                    dir="ltr"
                                />
                                <p className="text-[11px] text-muted-foreground">مثال: إذا وضعت 1، سيحصل الزبون على 25 نقطة عند شراء منتج بقيمة 25,000 د.ع</p>
                            </div>
                            <div className="space-y-2">
                                <Label>مدة صلاحية النقاط (بالأيام)</Label>
                                <Input
                                    name="points_expiry_days"
                                    type="number"
                                    defaultValue={(settings as any)?.points_expiry_days}
                                    dir="ltr"
                                />
                                <p className="text-[11px] text-muted-foreground">عدد الأيام قبل أن تنتهي صلاحية النقاط المكتسبة</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Redemption Rules */}
                    <Card className="border-primary/10 shadow-sm">
                        <CardHeader className="bg-primary/5">
                            <CardTitle className="text-md flex items-center gap-2">
                                <RefreshCcw size={18} className="text-primary" />
                                قواعد الاستبدال
                            </CardTitle>
                            <CardDescription>قيمة النقاط عند استخدامها كخصم</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="space-y-2">
                                <Label>قيمة النقطة الواحدة (بالدينار)</Label>
                                <Input
                                    name="dinar_per_point"
                                    type="number"
                                    step="0.01"
                                    defaultValue={(settings as any)?.dinar_per_point}
                                    dir="ltr"
                                />
                                <p className="text-[11px] text-muted-foreground">مثال: إذا وضعت 0.05، فإن الـ 1000 نقطة تساوي 50 دينار خصم</p>
                            </div>
                            <div className="space-y-2">
                                <Label>الحد الأدنى للطلب للاستبدال</Label>
                                <Input
                                    name="min_spend_to_redeem"
                                    type="number"
                                    defaultValue={(settings as any)?.min_spend_to_redeem}
                                    dir="ltr"
                                />
                                <p className="text-[11px] text-muted-foreground">أقل مبلغ للطلب يسمح بعده للزبون باستخدام نقاطه</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="mt-8 bg-blue-50 border border-blue-200 p-4 rounded-lg flex gap-3">
                    <Info className="text-blue-500 shrink-0" size={20} />
                    <p className="text-sm text-blue-700 leading-relaxed">
                        <strong>ملاحظة:</strong> هذه الإعدادات تطبق بشكل عام على كافة المنتجات المفعل بها خيار "نقاط الولاء". تأكد من مراجعة قيم الاستبدال لتناسب هامش ربحك.
                    </p>
                </div>

                <div className="mt-6 flex justify-end">
                    <Button type="submit" className="gap-2 px-8" disabled={updateMutation.isPending}>
                        <Save size={18} />
                        حفظ جميع الإعدادات
                    </Button>
                </div>
            </form>
        </div>
    );
}
