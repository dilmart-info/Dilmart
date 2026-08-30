import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import { formatPrice } from "@/lib/format";
import type { AdminExecutiveGovernanceResponse } from "@/lib/admin-executive.types";
import {
  getExecutiveReadinessHistory,
  recordExecutiveReadinessSnapshot,
} from "@/lib/executive-readiness-history";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertTriangle, BarChart3, LineChart as LineChartIcon, MapPin } from "lucide-react";

const DIST_COLORS = ["#ef4444", "#f59e0b", "#10b981"];

export default function AdminExecutive() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-executive-governance"],
    retry: false,
    queryFn: () => apiClient.getAdminExecutiveGovernance(),
  });

  useEffect(() => {
    if (data?.merchant_health?.avg_readiness_score != null) {
      recordExecutiveReadinessSnapshot(data.merchant_health.avg_readiness_score);
    }
  }, [data?.merchant_health?.avg_readiness_score]);

  const readinessHistory = getExecutiveReadinessHistory();

  if (isLoading) {
    return <div className="flex min-h-[320px] items-center justify-center text-muted-foreground">جاري تحميل لوحة الحوكمة التنفيذية…</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        تعذّر تحميل بيانات الحوكمة التنفيذية. تحقق من الصلاحيات أو حاول لاحقاً.
      </div>
    );
  }

  const distData = data.merchant_health.distribution.map((d) => ({
    name: d.label,
    value: d.count,
    key: d.key,
  }));

  const delayedGov = (data.delayed_order_risk.by_governorate ?? []).slice(0, 12);
  const weekly = data.weekly_commercial_throughput ?? [];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">حوكمة تنفيذية</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            لقطة أسبوعية لصحة التجار، مخاطر التأخير حسب المحافظة، وزخم الطلبات — M4.8
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            توليد: {new Date(data.generated_at).toLocaleString("ar-IQ")} · عقد JSON v{data.contract_version}
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          Executive
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5 text-emerald-600" />
              متوسط جاهزية التجار
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black tabular-nums">{data.merchant_health.avg_readiness_score}%</p>
            <p className="mt-1 text-xs text-muted-foreground">
              جاهز بالكامل: {data.merchant_health.ready_merchants} / {data.merchant_health.total_merchants}
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              طلبات متأخرة (+24س)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black tabular-nums text-amber-800">{data.delayed_order_risk.total_delayed}</p>
            <p className="mt-1 text-xs text-muted-foreground">معلّقة وتجاوزت 24 ساعة منذ الإنشاء</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5 text-sky-600" />
              طلبات (آخر أسبوع)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black tabular-nums">
              {weekly.length ? weekly[weekly.length - 1]?.order_count ?? 0 : 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">حجم أحدث نافذة أسبوعية في المخطط أدناه</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">توزيع صحة التجار (جاهزية)</CardTitle>
            <p className="text-xs text-muted-foreground">Buckets حسب درجة الجاهزية الحالية</p>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3}>
                  {distData.map((entry, i) => (
                    <Cell key={entry.key} fill={DIST_COLORS[i % DIST_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ direction: "rtl" }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5 text-primary" />
              خريطة مخاطر التأخير (حسب المحافظة)
            </CardTitle>
            <p className="text-xs text-muted-foreground">عدد الطلبات المتأخرة وقيمتها التقديرية</p>
          </CardHeader>
          <CardContent className="h-[300px]">
            {delayedGov.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">لا توجد طلبات متأخرة حالياً.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={delayedGov} layout="vertical" margin={{ left: 16, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="governorate_name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ direction: "rtl" }}
                    formatter={(v: number, name: string) =>
                      name === "delayed_revenue" ? [formatPrice(v), "قيمة"] : [v, "طلبات"]
                    }
                  />
                  <Bar dataKey="delayed_orders" name="طلبات" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LineChartIcon className="h-5 w-5 text-primary" />
            اتجاه متوسط الجاهزية (أسبوعي — محلي)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            يُحدَّث عند زيارة هذه الصفحة: يُخزَّن متوسط الجاهزية لكل أسبوع في هذا المتصفح لرسم اتجاه بسيط بمرور الوقت.
          </p>
        </CardHeader>
        <CardContent className="h-[260px]">
          {readinessHistory.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              عد لأسابيع قادمة لرسم السلسلة — أو أعد فتح الصفحة لاحقاً.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={readinessHistory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="weekKey" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ direction: "rtl" }} formatter={(v: number) => [`${v}%`, "متوسط"]} />
                <Line type="monotone" dataKey="avgScore" name="متوسط الجاهزية" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">زخم الطلبات (اتجاه تشغيلي أسبوعي)</CardTitle>
          <p className="text-xs text-muted-foreground">
            وكيل لاتجاه التحويل عند عدم توفر قمع زوار مركزي — عدد الطلبات وإيرادها لكل نافذة من 8 أسابيع
          </p>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="left" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ direction: "rtl" }}
                formatter={(v: number, name: string) =>
                  name === "revenue" ? [formatPrice(v), "إيراد"] : [v, "طلبات"]
                }
              />
              <Legend />
              <Bar yAxisId="left" dataKey="order_count" name="طلبات" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="revenue" name="إيراد" stroke="#a855f7" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">أدنى التجار جاهزية (متابعة سريعة)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.merchant_health.lowest_readiness_merchants.map((m) => (
              <Link
                key={m.merchant_id}
                to={`/admin/merchants/${m.merchant_id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
              >
                <span className="font-medium">{m.display_name || m.merchant_id}</span>
                <span className="tabular-nums text-muted-foreground">
                  {m.score}% {m.is_ready ? "· جاهز" : ""}
                </span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
