import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

type PreviewResponse = {
  import_id: string;
  summary: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    warnings_count: number;
  };
  rows: Array<{
    row_number: number;
    status: "valid" | "invalid" | "warning";
    normalized: {
      name: string;
      category_name: string;
      price: number;
      stock?: number;
      sku?: string;
    };
    errors: string[];
    warnings: string[];
  }>;
};

export default function ProductImport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ row_number: number; sku?: string; message: string }>;
  } | null>(null);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("اختر ملف CSV أولاً");
      return apiClient.previewMerchantProductImport(file);
    },
    onSuccess: (data: PreviewResponse) => {
      setPreview(data);
      setResult(null);
      toast.success("تم إنشاء معاينة الاستيراد");
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر قراءة الملف"),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!preview?.import_id) throw new Error("لا توجد جلسة استيراد صالحة");
      return apiClient.confirmMerchantProductImport(preview.import_id);
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success("تم تنفيذ الاستيراد");
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر تأكيد الاستيراد"),
  });

  const canConfirm = useMemo(() => {
    if (!preview) return false;
    if (confirmMutation.isPending) return false;
    if (preview.summary.valid_rows <= 0) return false;
    if (result) return false;
    return true;
  }, [preview, confirmMutation.isPending, result]);

  const handleDownloadTemplate = () => {
    const short =
      "عطر شرقي خشبي للجنسين بحجم 100 مل من لطافة يجمع لمسات التوابل والجلد والعود والعنبر في طابع دافئ ومتوازن.";
    const detailed =
      "يفتتح بالهيل والبرغموت ثم ينتقل إلى قلب من أوراق البنفسج والباتشولي ويستقر على الجلد والعود والعنبر.";
    const csv =
      "name,short_description,description,category,price,discount_price,stock,sku,brand,size,is_active,is_published,visibility_status,image_url\n" +
      `عطر فلفت عود,${short},${detailed},العطور والمعطرات > العطور,45000,40000,0,ARD-EXAMPLE,Lattafa,100 مل,false,false,private,\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "merchant-products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">استيراد المنتجات (CSV)</h2>
          <p className="text-sm text-muted-foreground mt-1">ارفع الملف ثم راجع المعاينة قبل التأكيد النهائي.</p>
        </div>
        <Button variant="outline" onClick={handleDownloadTemplate}>
          تحميل قالب المنتجات
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الخطوة 1: رفع الملف</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="flex gap-2">
            <Button onClick={() => previewMutation.mutate()} disabled={!file || previewMutation.isPending}>
              {previewMutation.isPending ? "جاري التحليل..." : "معاينة الاستيراد"}
            </Button>
            <Link to="/merchant/products">
              <Button variant="ghost">العودة للمنتجات</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>الخطوة 2: ملخص المعاينة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">إجمالي الصفوف: {preview.summary.total_rows}</Badge>
              <Badge>صالحة: {preview.summary.valid_rows}</Badge>
              <Badge variant="secondary">غير صالحة: {preview.summary.invalid_rows}</Badge>
              <Badge variant="outline">تحذيرات: {preview.summary.warnings_count}</Badge>
            </div>
            <Button onClick={() => confirmMutation.mutate()} disabled={!canConfirm}>
              {confirmMutation.isPending ? "جاري التنفيذ..." : "تأكيد الاستيراد"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>الخطوة 3: جدول المعاينة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الصف</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>القسم</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>المخزون</TableHead>
                    <TableHead>رمز المنتج</TableHead>
                    <TableHead>الأخطاء/التحذيرات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.slice(0, 200).map((row) => (
                    <TableRow key={row.row_number}>
                      <TableCell>{row.row_number}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "invalid" ? "destructive" : row.status === "warning" ? "secondary" : "default"}>
                          {row.status === "valid" ? "صالح" : row.status === "invalid" ? "غير صالح" : "تحذير"}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.normalized.name}</TableCell>
                      <TableCell>{row.normalized.category_name}</TableCell>
                      <TableCell>{row.normalized.price}</TableCell>
                      <TableCell>{row.normalized.stock ?? 0}</TableCell>
                      <TableCell>{row.normalized.sku ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {row.errors.length > 0
                          ? `خطأ: ${row.errors.join(" | ")}`
                          : row.warnings.length > 0
                            ? `تحذير: ${row.warnings.join(" | ")}`
                            : "سليم"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>نتيجة التأكيد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>الإجمالي: {result.total}</p>
            <p>تم الإنشاء: {result.created}</p>
            <p>تم التحديث: {result.updated}</p>
            <p>تم التخطي: {result.skipped}</p>
            <p>فشل: {result.failed}</p>
            {result.errors.length > 0 ? (
              <ul className="list-disc pr-5 text-sm text-destructive">
                {result.errors.slice(0, 20).map((e, idx) => (
                  <li key={`${e.row_number}-${idx}`}>
                    الصف {e.row_number}
                    {e.sku ? ` (${e.sku})` : ""}: {e.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

