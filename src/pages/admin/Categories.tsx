import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Save, X, CornerDownLeft } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";

export default function AdminCategories() {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [sortOrder, setSortOrder] = useState("0");
    const [parentId, setParentId] = useState<string>("root");
    const [imageUrl, setImageUrl] = useState("");
    const [iconUrl, setIconUrl] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [isFeatured, setIsFeatured] = useState(false);
    const [layoutVariant, setLayoutVariant] = useState<"normal" | "wide" | "promo">("normal");
    const [backgroundColor, setBackgroundColor] = useState("");
    const [textColor, setTextColor] = useState("");
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingIcon, setUploadingIcon] = useState(false);
    const queryClient = useQueryClient();

    const { data: categories, isLoading } = useQuery({
        queryKey: ["admin-categories"],
        queryFn: () => apiClient.getCategoriesAdminList(),
    });

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload: any = {
                name,
                slug,
                sort_order: parseInt(sortOrder),
                parent_id: parentId === "root" ? null : parentId,
                image_url: imageUrl || null,
                icon_url: iconUrl || null,
                is_active: isActive,
                is_featured: isFeatured,
                layout_variant: layoutVariant,
                background_color: backgroundColor || null,
                text_color: textColor || null,
            };

            if (!name.trim() || !slug.trim() || Number.isNaN(parseInt(sortOrder)) || !imageUrl.trim()) {
                throw new Error("الاسم والرابط والترتيب وصورة القسم حقول مطلوبة.");
            }

            if (editingId) {
                await apiClient.updateCategory(editingId, payload);
            } else {
                await apiClient.createCategory(payload);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
            toast.success(editingId ? "تم التحديث" : "تمت الإضافة");
            resetForm();
        },
        onError: (err: any) => toast.error(err.message || "حدث خطأ"),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiClient.deleteCategory(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
            toast.success("تم الحذف");
        },
        onError: (err: any) => toast.error("لا يمكن حذف قسم يحتوي على منتجات أو أقسام فرعية"),
    });

    const resetForm = () => {
        setEditingId(null);
        setName("");
        setSlug("");
        setSortOrder("0");
        setParentId("root");
        setImageUrl("");
        setIconUrl("");
        setIsActive(true);
        setIsFeatured(false);
        setLayoutVariant("normal");
        setBackgroundColor("");
        setTextColor("");
    };

    const handleEdit = (cat: any) => {
        setEditingId(cat.id);
        setName(cat.name);
        setSlug(cat.slug);
        setSortOrder(cat.sort_order?.toString() || "0");
        setParentId(cat.parent_id || "root");
        setImageUrl(cat.image_url ?? "");
        setIconUrl(cat.icon_url ?? "");
        setIsActive((cat.is_active ?? true) as boolean);
        setIsFeatured((cat.is_featured ?? false) as boolean);
        setLayoutVariant((cat.layout_variant ?? "normal") as "normal" | "wide" | "promo");
        setBackgroundColor(cat.background_color ?? "");
        setTextColor(cat.text_color ?? "");
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const generateSlug = (val: string) => {
        return val.toLowerCase().replace(/[^\w\s\u0600-\u06FF]/g, "").replace(/\s+/g, "-");
    };

    const fileToBase64 = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                if (typeof result !== "string") {
                    reject(new Error("تعذر قراءة الملف"));
                    return;
                }
                const payload = result.split(",")[1];
                if (!payload) {
                    reject(new Error("ملف غير صالح"));
                    return;
                }
                resolve(payload);
            };
            reader.onerror = () => reject(reader.error ?? new Error("تعذر قراءة الملف"));
            reader.readAsDataURL(file);
        });

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: "image" | "icon") => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            if (target === "image") setUploadingImage(true);
            if (target === "icon") setUploadingIcon(true);
            const base64Data = await fileToBase64(file);
            const uploaded = await apiClient.uploadProductImage({
                file_name: file.name,
                content_type: file.type || "image/jpeg",
                base64_data: base64Data,
            });
            if (target === "image") {
                setImageUrl(uploaded.public_url);
                toast.success("تم رفع صورة القسم");
            } else {
                setIconUrl(uploaded.public_url);
                toast.success("تم رفع أيقونة القسم");
            }
        } catch (error: any) {
            toast.error(error?.message || "تعذر رفع الصورة");
        } finally {
            if (target === "image") setUploadingImage(false);
            if (target === "icon") setUploadingIcon(false);
            e.currentTarget.value = "";
        }
    };

    // Organise categories hierarchically for the table
    const rootCategories = categories?.filter(c => !c.parent_id) || [];
    const getChildren = (id: string) => categories?.filter(c => c.parent_id === id) || [];
    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">إدارة الأقسام</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                {/* Form */}
                <div className="lg:col-span-1">
                    <Card className="lg:sticky lg:top-24 shadow-lg border-primary/10">
                        <CardHeader className="bg-primary/5 pb-4">
                            <CardTitle className="text-lg">{editingId ? "تعديل قسم" : "إضافة قسم جديد"}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="space-y-2">
                                <Label>اسم القسم</Label>
                                <Input
                                    value={name}
                                    placeholder="مثال: موبايلات"
                                    onChange={(e) => {
                                        setName(e.target.value);
                                        if (!editingId) setSlug(generateSlug(e.target.value));
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>الرابط (Slug)</Label>
                                <Input value={slug} onChange={(e) => setSlug(e.target.value)} dir="ltr" placeholder="mobiles" />
                            </div>
                            <div className="space-y-2">
                                <Label>رابط صورة القسم (image_url) *</Label>
                                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} dir="ltr" placeholder="https://..." />
                                <div className="flex items-center gap-2">
                                    <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/40">
                                        {uploadingImage ? "جاري رفع الصورة..." : "رفع صورة من الجهاز"}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => void handleImageUpload(e, "image")} />
                                    </label>
                                    <p className="text-[10px] text-muted-foreground">هذا الحقل يعمل مع الأقسام الرئيسية والفرعية.</p>
                                </div>
                                {imageUrl ? (
                                    <img src={imageUrl} alt="معاينة صورة القسم" className="h-20 w-20 rounded-md object-cover border border-border" />
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label>رابط أيقونة القسم (icon_url)</Label>
                                <Input value={iconUrl} onChange={(e) => setIconUrl(e.target.value)} dir="ltr" placeholder="https://..." />
                                <div className="flex items-center gap-2">
                                    <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/40">
                                        {uploadingIcon ? "جاري رفع الأيقونة..." : "رفع أيقونة من الجهاز"}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => void handleImageUpload(e, "icon")} />
                                    </label>
                                </div>
                                {iconUrl ? (
                                    <img src={iconUrl} alt="معاينة أيقونة القسم" className="h-12 w-12 rounded-md object-cover border border-border" />
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label>القسم الرئيسي (اختياري)</Label>
                                <Select value={parentId} onValueChange={setParentId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="اختر قسماً رئيسياً" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="root">-- قسم رئيسي --</SelectItem>
                                        {rootCategories
                                            .filter(c => c.id !== editingId)
                                            .map(cat => (
                                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                            ))
                                        }
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-muted-foreground">اتركه كما هو ليكون قسماً أساسياً</p>
                            </div>

                            <div className="space-y-2">
                                <Label>ترتيب العرض</Label>
                                <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} dir="ltr" />
                            </div>
                            <div className="space-y-2">
                                <Label>نمط البطاقة (layout_variant)</Label>
                                <Select value={layoutVariant} onValueChange={(v: "normal" | "wide" | "promo") => setLayoutVariant(v)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="normal">normal</SelectItem>
                                        <SelectItem value="wide">wide</SelectItem>
                                        <SelectItem value="promo">promo</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-2">
                                    <Label>لون الخلفية</Label>
                                    <Input value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} dir="ltr" placeholder="#111111" />
                                </div>
                                <div className="space-y-2">
                                    <Label>لون النص</Label>
                                    <Input value={textColor} onChange={(e) => setTextColor(e.target.value)} dir="ltr" placeholder="#ffffff" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <Label>فعال (is_active)</Label>
                                <Switch checked={isActive} onCheckedChange={setIsActive} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label>مميز (is_featured)</Label>
                                <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button className="flex-1 gap-2" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                                    <Save size={18} />
                                    {editingId ? "تحديث القسم" : "حفظ القسم"}
                                </Button>
                                {editingId && (
                                    <Button variant="outline" size="icon" onClick={resetForm}>
                                        <X size={18} />
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* List */}
                <div className="lg:col-span-2">
                    <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="text-right w-16">#</TableHead>
                                    <TableHead className="text-right">صورة</TableHead>
                                    <TableHead className="text-right">الاسم</TableHead>
                                    <TableHead className="text-right">الرابط</TableHead>
                                    <TableHead className="text-right">الحالة</TableHead>
                                    <TableHead className="text-right">النمط</TableHead>
                                    <TableHead className="text-center">إجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-10">جاري التحميل...</TableCell>
                                    </TableRow>
                                ) : rootCategories.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">لا توجد أقسام</TableCell>
                                    </TableRow>
                                ) : rootCategories.map((cat) => (
                                    <React.Fragment key={cat.id}>
                                        {/* Root Category */}
                                        <TableRow className="group hover:bg-muted/30">
                                            <TableCell>{cat.sort_order}</TableCell>
                                            <TableCell>
                                                <button type="button" onClick={() => handleEdit(cat)} title="تعديل صورة القسم">
                                                    {cat.image_url ? (
                                                        <img src={cat.image_url} alt={cat.name} className="h-10 w-10 rounded-md object-cover border border-border" />
                                                    ) : (
                                                        <div className="h-10 w-10 rounded-md bg-muted border border-border" />
                                                    )}
                                                </button>
                                            </TableCell>
                                            <TableCell className="font-bold text-primary">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span>{cat.name}</span>
                                                    <Badge variant="outline">جذر</Badge>
                                                    {getChildren(cat.id).some((c: any) => c.is_active !== false) ? (
                                                        <Badge variant="secondary">له فروع</Badge>
                                                    ) : (
                                                        <Badge>قابل للتعيين</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm font-mono text-muted-foreground">{cat.slug}</TableCell>
                                            <TableCell>
                                                <Badge variant={cat.is_active === false ? "secondary" : "default"}>
                                                    {cat.is_active === false ? "معطل" : "نشط"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{cat.layout_variant ?? "normal"}</Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(cat)}>
                                                        <Edit size={16} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => {
                                                            if (confirm("هل أنت متأكد؟ سيتم حذف جميع الأقسام الفرعية أيضاً")) deleteMutation.mutate(cat.id);
                                                        }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>

                                        {/* Children */}
                                        {getChildren(cat.id).map(child => (
                                            <TableRow key={child.id} className="bg-muted/5 hover:bg-muted/20">
                                                <TableCell className="text-muted-foreground/50">{child.sort_order}</TableCell>
                                                <TableCell>
                                                    <button type="button" onClick={() => handleEdit(child)} title="تعديل صورة القسم الفرعي">
                                                        {child.image_url ? (
                                                            <img src={child.image_url} alt={child.name} className="h-9 w-9 rounded-md object-cover border border-border" />
                                                        ) : (
                                                            <div className="h-9 w-9 rounded-md bg-muted border border-border" />
                                                        )}
                                                    </button>
                                                </TableCell>
                                                <TableCell className="pr-8">
                                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                                        <CornerDownLeft size={14} className="text-muted-foreground" />
                                                        <span>{child.name}</span>
                                                        <Badge variant="outline">فرع</Badge>
                                                        {getChildren(child.id).some((c: any) => c.is_active !== false) ? (
                                                            <Badge variant="secondary">له فروع</Badge>
                                                        ) : (
                                                            <Badge>قابل للتعيين</Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs font-mono text-muted-foreground/70">{child.slug}</TableCell>
                                                <TableCell>
                                                    <Badge variant={child.is_active === false ? "secondary" : "default"}>
                                                        {child.is_active === false ? "معطل" : "نشط"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{child.layout_variant ?? "normal"}</Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(child)}>
                                                            <Edit size={14} />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                                            onClick={() => {
                                                                if (confirm("هل أنت متأكد؟")) deleteMutation.mutate(child.id);
                                                            }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        </div>
    );
}
