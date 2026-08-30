import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import { Roles } from "../../common/authz/roles.decorator";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** Public-safe ingestion: accepts anonymous events; enriches actor when token exists. */
  @Post("events/ingest")
  ingest(
    @Body() payload: { events?: Array<Record<string, unknown>> },
    @CurrentActor() actor?: { actorId?: string; actorRole?: string },
  ) {
    return this.analyticsService.ingestEvents({
      events: (payload?.events ?? []) as any,
      actor_id: actor?.actorId ?? null,
      actor_role: actor?.actorRole ?? null,
    });
  }

  /** M5.1 read path for summaries (authenticated scopes). */
  @Get("events/summary")
  @Roles("authenticated")
  summary(
    @Query("window_days") windowDays?: string,
    @Query("merchant_id") merchantId?: string,
    @Query("names") namesCsv?: string,
  ) {
    const names = String(namesCsv ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    return this.analyticsService.getEventSummary({
      window_days: windowDays ? Number(windowDays) : undefined,
      merchant_id: merchantId,
      names: names.length > 0 ? names : undefined,
    });
  }

  @Get("experiments")
  @Roles("super_admin", "admin")
  listExperiments() {
    return this.analyticsService.listExperiments();
  }

  @Post("experiments")
  @Roles("super_admin", "admin")
  upsertExperiment(
    @Body()
    payload: {
      experiment_id: string;
      label: string;
      description?: string;
      surface?: string;
      variants?: string[];
      primary_outcome_key?: string;
      status?: "draft" | "running" | "paused" | "archived";
    },
  ) {
    return this.analyticsService.upsertExperiment(payload);
  }

  @Get("experiments/report")
  @Roles("super_admin", "admin")
  getExperimentReport(
    @Query("experiment_id") experimentId?: string,
    @Query("window_days") windowDays?: string,
    @Query("merchant_id") merchantId?: string,
  ) {
    return this.analyticsService.getExperimentReport({
      experiment_id: String(experimentId ?? ""),
      window_days: windowDays ? Number(windowDays) : undefined,
      merchant_id: merchantId,
    });
  }

  @Get("ops/ingestion-health")
  @Roles("super_admin", "admin")
  getIngestionHealth(@Query("window_hours") windowHours?: string) {
    return this.analyticsService.getIngestionHealth({
      window_hours: windowHours ? Number(windowHours) : undefined,
    });
  }

  @Post("ops/retention-cleanup")
  @Roles("super_admin", "admin")
  cleanupOldEvents(@Body() payload?: { older_than_days?: number; dry_run?: boolean }) {
    return this.analyticsService.cleanupOldEvents(payload);
  }
}

