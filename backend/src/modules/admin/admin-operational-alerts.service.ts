import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AppActorRole } from "../../common/authz/roles.decorator";
import { ActorContext } from "../../common/authz/actor-context.decorator";
import {
  classifyDesktopQuickLinkHref,
  describeDesktopQuickLinkHrefRejection,
  isValidDesktopQuickLinkHref,
} from "./desktop-quick-link-href.validator";

export type AdminNotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export type ComputedAlert = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export type GovernanceTaskRow = {
  task_id: string;
  owner?: string | null;
  deadline?: string | null;
  status?: "open" | "in_progress" | "resolved" | "escalated" | null;
  updated_at?: string | null;
  updated_by?: string | null;
  note?: string | null;
};

@Injectable()
export class AdminOperationalAlertsService {
  private lastOpsAlertFanoutSignature = "";
  private lastOpsAlertFanoutAt = 0;

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  maybeFanoutOperationalAlerts(alerts: ComputedAlert[]) {
    if (!alerts.length) return;
    const signature = alerts
      .map((alert) => `${alert.type}|${alert.title}|${alert.message}`)
      .sort()
      .join("::");
    const now = Date.now();
    const shouldSkip = signature === this.lastOpsAlertFanoutSignature && now - this.lastOpsAlertFanoutAt < 10 * 60 * 1000;
    if (shouldSkip) return;
    this.lastOpsAlertFanoutSignature = signature;
    this.lastOpsAlertFanoutAt = now;
    void this.notificationsService.dispatchOperationalAlerts(alerts as any);
  }

  async listAdminNotifications() {
    const { data, error } = await this.supabaseAdmin.client
      .from("admin_notifications")
      .select("id, type, title, message, link, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const computedAlerts = await this.computeOperationalAlerts();
    this.maybeFanoutOperationalAlerts(computedAlerts);
    const persisted = (data ?? []) as AdminNotificationRow[];
    const merged = [...computedAlerts, ...persisted].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 20);
    return merged;
  }

  async computeOperationalAlerts(): Promise<ComputedAlert[]> {
    const nowIso = new Date().toISOString();

    const { data, error } = await this.supabaseAdmin.client.rpc("operational_alert_counts");
    if (error) throw error;

    const counts = data as {
      delayed_orders_count: number;
      non_ready_products_count: number;
      draft_merchants_count: number;
      low_stock_products_count: number;
    };

    const alerts: ComputedAlert[] = [];
    if (counts.delayed_orders_count > 0) {
      alerts.push({
        id: "computed-delayed-orders",
        type: "alert_delayed_orders",
        title: "طلبات متأخرة تحتاج متابعة",
        message: `يوجد ${counts.delayed_orders_count} طلبًا معلّقًا أكثر من 24 ساعة.`,
        link: "/admin/orders",
        is_read: false,
        created_at: nowIso,
      });
    }
    if (counts.non_ready_products_count > 0) {
      alerts.push({
        id: "computed-nonready-products",
        type: "alert_catalog_quality",
        title: "جودة كتالوج تحتاج تحسين",
        message: `يوجد ${counts.non_ready_products_count} منتجًا غير جاهز تجاريًا.`,
        link: "/admin/products",
        is_read: false,
        created_at: nowIso,
      });
    }
    if (counts.draft_merchants_count > 0) {
      alerts.push({
        id: "computed-merchants-not-active",
        type: "alert_merchant_readiness",
        title: "تجار غير جاهزين للتشغيل",
        message: `يوجد ${counts.draft_merchants_count} تاجرًا بحالة غير نشطة.`,
        link: "/admin/merchants",
        is_read: false,
        created_at: nowIso,
      });
    }
    if (counts.low_stock_products_count > 0) {
      alerts.push({
        id: "computed-low-stock",
        type: "alert_low_stock",
        title: "منتجات بمخزون منخفض",
        message: `يوجد ${counts.low_stock_products_count} منتجًا بمخزون منخفض يحتاج متابعة.`,
        link: "/admin/inventory",
        is_read: false,
        created_at: nowIso,
      });
    }
    return alerts;
  }

  async markAdminNotificationRead(notificationId: string, actor: ActorContext) {
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;

    const { data: current, error: fetchError } = await this.supabaseAdmin.client
      .from("admin_notifications")
      .select("id, is_read")
      .eq("id", notificationId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!current) throw new NotFoundException("Notification not found.");
    if ((current as { is_read?: boolean }).is_read) {
      return { ok: true as const, alreadyRead: true as const };
    }

    const { error: updateError } = await this.supabaseAdmin.client
      .from("admin_notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("is_read", false);
    if (updateError) throw updateError;

    await this.auditService.log({
      eventType: "NOTIFICATION_READ",
      actor: { actorId, actorRole },
      resource: { type: "admin_notification", id: notificationId },
      payload: { action: "mark_read" },
    });

    return { ok: true as const, alreadyRead: false as const };
  }

  async markAllAdminNotificationsRead(actor: ActorContext) {
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;

    const { data: unreadRows, error: fetchError } = await this.supabaseAdmin.client
      .from("admin_notifications")
      .select("id")
      .eq("is_read", false)
      .limit(200);

    if (fetchError) throw fetchError;
    const unreadIds = (unreadRows ?? []).map((row) => (row as { id: string }).id);
    if (unreadIds.length === 0) {
      return { ok: true as const, updatedCount: 0 };
    }

    const { error: updateError } = await this.supabaseAdmin.client
      .from("admin_notifications")
      .update({ is_read: true })
      .in("id", unreadIds)
      .eq("is_read", false);
    if (updateError) throw updateError;

    await this.auditService.log({
      eventType: "NOTIFICATION_READ",
      actor: { actorId, actorRole },
      resource: { type: "admin_notification", id: "bulk" },
      payload: { action: "mark_all_read", count: unreadIds.length },
    });

    return { ok: true as const, updatedCount: unreadIds.length };
  }

  async listGovernanceTasks(taskIds?: string[]) {
    let req = this.supabaseAdmin.client
      .from("governance_tasks")
      .select("task_id, owner, deadline, status, updated_at, updated_by, note")
      .order("updated_at", { ascending: false })
      .limit(300);
    if (taskIds && taskIds.length > 0) {
      req = req.in("task_id", taskIds);
    }
    const { data, error } = await req;
    if (error) {
      return { tasks: [], message: "Governance tasks table unavailable.", error: error.message };
    }
    return { tasks: (data ?? []) as GovernanceTaskRow[] };
  }

  async upsertGovernanceTask(
    taskId: string,
    payload: { owner?: string; deadline?: string; status: "open" | "in_progress" | "resolved" | "escalated"; note?: string },
    actor: ActorContext,
  ) {
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;
    const row = {
      task_id: taskId,
      owner: payload.owner ?? "",
      deadline: payload.deadline ?? "",
      status: payload.status,
      note: payload.note ?? null,
      updated_by: actorId || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await this.supabaseAdmin.client
      .from("governance_tasks")
      .upsert(row as any, { onConflict: "task_id" })
      .select("task_id, owner, deadline, status, updated_at, updated_by, note")
      .maybeSingle();
    if (error) {
      return { ok: false as const, message: "Governance task write failed.", error: error.message };
    }

    await this.auditService.log({
      eventType: "GOVERNANCE_TASK_UPDATED",
      actor: { actorId, actorRole },
      resource: { type: "governance_task", id: taskId },
      payload: { status: payload.status },
    });

    return { ok: true as const, data };
  }

  async listDesktopQuickLinks() {
    const { data, error } = await this.supabaseAdmin.client
      .from("desktop_quick_links")
      .select("id,label,href,sort_order,is_active")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async createDesktopQuickLink(payload: { label: string; href: string; sort_order: number; is_active: boolean }) {
    if (!isValidDesktopQuickLinkHref(payload.href)) {
      const reason = classifyDesktopQuickLinkHref(payload.href);
      throw new BadRequestException(describeDesktopQuickLinkHrefRejection(reason));
    }
    const { data, error } = await this.supabaseAdmin.client
      .from("desktop_quick_links")
      .insert(payload as any)
      .select("id,label,href,sort_order,is_active")
      .single();
    if (error) throw error;
    return data;
  }

  async updateDesktopQuickLink(id: string, payload: Partial<{ label: string; href: string; sort_order: number; is_active: boolean }>) {
    // href is optional on update (label/sort_order/is_active-only edits stay valid) — only
    // validate when the caller actually supplied a new href.
    if (payload.href !== undefined && !isValidDesktopQuickLinkHref(payload.href)) {
      const reason = classifyDesktopQuickLinkHref(payload.href);
      throw new BadRequestException(describeDesktopQuickLinkHrefRejection(reason));
    }
    const { data, error } = await this.supabaseAdmin.client
      .from("desktop_quick_links")
      .update(payload as any)
      .eq("id", id)
      .select("id,label,href,sort_order,is_active")
      .single();
    if (error) throw error;
    return data;
  }

  async deleteDesktopQuickLink(id: string) {
    const { error } = await this.supabaseAdmin.client
      .from("desktop_quick_links")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  }
}
