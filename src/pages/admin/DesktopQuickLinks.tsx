import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  classifyDesktopQuickLinkHref,
  describeDesktopQuickLinkHrefRejection,
  isValidDesktopQuickLinkHref,
} from "@/lib/desktop-quick-link-href";

type LinkRow = {
  id: string;
  label: string;
  href: string;
  sort_order: number;
  is_active: boolean;
};

export default function AdminDesktopQuickLinks() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ label: "", href: "", sort_order: "0", is_active: true });
  // Per-row href edit drafts, keyed by row id — only populated while a row's href is actively
  // being edited to a different value. Lets each row show its own inline validation error
  // without touching label/sort/is_active edits, which never require the href to be valid.
  const [hrefEdits, setHrefEdits] = useState<Record<string, string>>({});

  const { data: links, isLoading } = useQuery({
    queryKey: ["admin-desktop-quick-links"],
    queryFn: () => apiClient.listAdminDesktopQuickLinks(),
  });

  const draftHrefClassification = useMemo(
    () => (draft.href.trim() ? classifyDesktopQuickLinkHref(draft.href.trim()) : null),
    [draft.href],
  );
  const draftHrefError =
    draftHrefClassification && draftHrefClassification !== "VALID_INTERNAL"
      ? describeDesktopQuickLinkHrefRejection(draftHrefClassification)
      : null;
  const hasDraft = useMemo(
    () => Boolean(draft.label.trim() && draft.href.trim() && isValidDesktopQuickLinkHref(draft.href.trim())),
    [draft.label, draft.href],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-desktop-quick-links"] });
    queryClient.invalidateQueries({ queryKey: ["desktop-quick-links"] });
  };

  const createLink = async () => {
    if (!hasDraft) return;
    try {
      await apiClient.createAdminDesktopQuickLink({
        label: draft.label.trim(),
        href: draft.href.trim(),
        sort_order: Number(draft.sort_order || 0),
        is_active: draft.is_active,
      });
      toast.success("تمت إضافة الرابط");
      setDraft({ label: "", href: "", sort_order: "0", is_active: true });
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر إضافة الرابط");
    }
  };

  const updateLink = async (id: string, payload: Partial<LinkRow>): Promise<boolean> => {
    try {
      await apiClient.updateAdminDesktopQuickLink(id, payload);
      toast.success("تم تحديث الرابط");
      refresh();
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر تحديث الرابط");
      return false;
    }
  };

  const removeLink = async (id: string) => {
    try {
      await apiClient.deleteAdminDesktopQuickLink(id);
      toast.success("تم حذف الرابط");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر حذف الرابط");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>شريط الروابط أسفل الهيدر (Desktop)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            أضف روابط سريعة (أقسام، عروض، أو صفحات منتجات) لتظهر بعرض الشاشة بالكامل تحت الهيدر في شاشة الكمبيوتر فقط.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input value={draft.label} onChange={(e) => setDraft((s) => ({ ...s, label: e.target.value }))} placeholder="مثال: كل العروض" />
            </div>
            <div className="space-y-1">
              <Label>الرابط</Label>
              <Input
                value={draft.href}
                onChange={(e) => setDraft((s) => ({ ...s, href: e.target.value }))}
                placeholder="/offers أو /products?search=..."
                dir="ltr"
                aria-invalid={Boolean(draftHrefError)}
              />
              {draftHrefError && <p className="text-xs text-destructive">{draftHrefError}</p>}
            </div>
            <div className="space-y-1">
              <Label>الترتيب</Label>
              <Input type="number" value={draft.sort_order} onChange={(e) => setDraft((s) => ({ ...s, sort_order: e.target.value }))} dir="ltr" />
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft((s) => ({ ...s, is_active: v }))} />
                <span className="text-sm">نشط</span>
              </div>
              <Button onClick={createLink} disabled={!hasDraft}>
                <Plus size={16} className="ml-1" />
                إضافة
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>روابط الشريط الحالية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">جاري التحميل...</p>
          ) : !links || links.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد روابط بعد.</p>
          ) : (
            links.map((row) => {
              const editedHref = hrefEdits[row.id];
              const hrefValue = editedHref ?? row.href;
              const hrefIsDirty = editedHref !== undefined && editedHref !== row.href;
              const hrefClassification = hrefIsDirty ? classifyDesktopQuickLinkHref(editedHref) : null;
              const hrefError =
                hrefClassification && hrefClassification !== "VALID_INTERNAL"
                  ? describeDesktopQuickLinkHrefRejection(hrefClassification)
                  : null;

              return (
                <div key={row.id} className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 md:grid-cols-5">
                  <Input defaultValue={row.label} onBlur={(e) => e.target.value !== row.label && updateLink(row.id, { label: e.target.value })} />
                  <div className="space-y-1">
                    <Input
                      dir="ltr"
                      value={hrefValue}
                      aria-invalid={Boolean(hrefError)}
                      onChange={(e) => setHrefEdits((s) => ({ ...s, [row.id]: e.target.value }))}
                      onBlur={async () => {
                        if (!hrefIsDirty) return;
                        if (!isValidDesktopQuickLinkHref(editedHref)) return; // keep inline error, no API call
                        const ok = await updateLink(row.id, { href: editedHref });
                        // Only drop the local draft once the update actually succeeded — on
                        // failure it must fall back to being re-shown as the dirty value, not
                        // silently reverted to the stale row.href.
                        if (ok) {
                          setHrefEdits((s) => {
                            const next = { ...s };
                            delete next[row.id];
                            return next;
                          });
                        }
                      }}
                    />
                    {hrefError && <p className="text-xs text-destructive">{hrefError}</p>}
                  </div>
                  <Input
                    type="number"
                    dir="ltr"
                    defaultValue={row.sort_order}
                    onBlur={(e) => Number(e.target.value) !== row.sort_order && updateLink(row.id, { sort_order: Number(e.target.value || 0) })}
                  />
                  <div className="flex items-center gap-2">
                    <Switch checked={row.is_active} onCheckedChange={(v) => updateLink(row.id, { is_active: v })} />
                    <span className="text-sm">نشط</span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="icon" variant="outline" onClick={() => updateLink(row.id, {})}>
                      <Save size={15} />
                    </Button>
                    <Button size="icon" variant="destructive" onClick={() => removeLink(row.id)}>
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
