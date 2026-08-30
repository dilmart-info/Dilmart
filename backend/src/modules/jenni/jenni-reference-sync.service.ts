import { Injectable, Logger } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { JenniClientService } from "./jenni-client.service";
import { JenniPricingService } from "./jenni-pricing.service";
import { matchGovernorateToJenni, type JenniGovernorateRef } from "./jenni-name.util";

type SyncReferenceOptions = {
  dry_run?: boolean;
  sync_cities?: boolean;
  copy_existing_governorate_prices?: boolean;
};

type JenniCityRef = {
  code?: string;
  name_ar?: string;
  name_en?: string;
  governorate_code?: string;
  [key: string]: unknown;
};

@Injectable()
export class JenniReferenceSyncService {
  private readonly logger = new Logger(JenniReferenceSyncService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly jenniClient: JenniClientService,
    private readonly jenniPricing: JenniPricingService,
  ) {}

  private extractGovernorates(payload: unknown): JenniGovernorateRef[] {
    const root = payload as { data?: unknown; governorates?: unknown };
    const list = (Array.isArray(root?.data) ? root.data : Array.isArray(root?.governorates) ? root.governorates : []) as unknown[];
    return list
      .map((row) => {
        const item = row as Record<string, unknown>;
        const code = String(item.code ?? item.governorate_code ?? "").trim().toUpperCase();
        if (!code) return null;
        return {
          code,
          name_en: String(item.name_en ?? item.nameEn ?? item.name ?? "").trim() || null,
          name_ar: String(item.name_ar ?? item.nameAr ?? item.name_arabic ?? "").trim() || null,
        };
      })
      .filter(Boolean) as JenniGovernorateRef[];
  }

  private extractCitiesPage(payload: unknown): JenniCityRef[] {
    const root = payload as { data?: unknown; cities?: unknown; content?: unknown };
    const list = (
      Array.isArray(root?.data) ? root.data : Array.isArray(root?.cities) ? root.cities : Array.isArray(root?.content) ? root.content : []
    ) as unknown[];
    return list.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        code: item.code != null ? String(item.code) : undefined,
        name_ar: String(item.name_ar ?? item.nameAr ?? item.name ?? "").trim() || undefined,
        name_en: String(item.name_en ?? item.nameEn ?? "").trim() || undefined,
        governorate_code: String(item.governorate_code ?? item.governorateCode ?? "").trim().toUpperCase() || undefined,
        ...item,
      };
    });
  }

  async syncReferenceData(options: SyncReferenceOptions = {}) {
    const dry_run = !!options.dry_run;
    const sync_cities = !!options.sync_cities;
    const copy_prices = options.copy_existing_governorate_prices !== false;

    const jenniPayload = await this.jenniClient.listGovernorates();
    const jenniGovernorates = this.extractGovernorates(jenniPayload);
    if (jenniGovernorates.length === 0) {
      return { ok: false, message: "Jenni returned no governorates.", matched: [], unmatched_local: [], unmatched_jenni: [] };
    }

    const { data: localGovernorates, error: localError } = await this.supabaseAdmin.client
      .from("governorates")
      .select("id,name,jenni_governorate_code,delivery_price")
      .order("sort_order");
    if (localError) throw localError;

    const matched: Array<{ id: string; name: string; jenni_code: string; previous_code: string | null }> = [];
    const unmatched_local: Array<{ id: string; name: string }> = [];
    const usedJenniCodes = new Set<string>();

    for (const local of localGovernorates ?? []) {
      const hit = matchGovernorateToJenni(String((local as any).name ?? ""), jenniGovernorates);
      if (!hit) {
        unmatched_local.push({ id: local.id as string, name: String((local as any).name ?? "") });
        continue;
      }
      usedJenniCodes.add(hit.code);
      const previous = (local as any).jenni_governorate_code ?? null;
      matched.push({
        id: local.id as string,
        name: String((local as any).name ?? ""),
        jenni_code: hit.code,
        previous_code: previous,
      });

      if (!dry_run) {
        await this.supabaseAdmin.client
          .from("governorates")
          .update({ jenni_governorate_code: hit.code })
          .eq("id", local.id);
      }
    }

    const unmatched_jenni = jenniGovernorates
      .filter((g) => !usedJenniCodes.has(g.code))
      .map((g) => ({ code: g.code, name_ar: g.name_ar, name_en: g.name_en }));

    let prices_upserted = 0;
    if (copy_prices && !dry_run) {
      const companyId = await this.jenniPricing.getJenniCompanyId();
      for (const row of localGovernorates ?? []) {
        const price = Number((row as any).delivery_price ?? 0);
        if (!Number.isFinite(price) || price < 0) continue;
        const { error } = await this.supabaseAdmin.client.from("delivery_prices").upsert(
          {
            company_id: companyId,
            governorate_id: (row as any).id,
            price,
          },
          { onConflict: "company_id,governorate_id" },
        );
        if (!error) prices_upserted += 1;
      }
    }

    let cities_synced = 0;
    const cities_by_governorate: Record<string, number> = {};

    if (sync_cities && !dry_run) {
      await this.supabaseAdmin.client
        .from("jenni_cities_reference")
        .delete()
        .gte("synced_at", "1970-01-01T00:00:00.000Z");

      for (const gov of jenniGovernorates) {
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 200) {
          const cityPayload = await this.jenniClient.listCitiesPage(gov.code, page, 100);
          const cities = this.extractCitiesPage(cityPayload);
          if (cities.length === 0) {
            hasMore = false;
            break;
          }

          const rows = cities.map((city) => ({
            governorate_code: city.governorate_code ?? gov.code,
            name_ar: city.name_ar ?? null,
            name_en: city.name_en ?? null,
            jenni_code: city.code ?? null,
            payload: city as Record<string, unknown>,
            synced_at: new Date().toISOString(),
          }));

          const { error: cityError } = await this.supabaseAdmin.client.from("jenni_cities_reference").upsert(rows, {
            onConflict: "governorate_code,name_ar",
          });
          if (cityError) {
            this.logger.warn(`Jenni cities upsert warning for ${gov.code} page ${page}: ${cityError.message}`);
          } else {
            cities_synced += rows.length;
            cities_by_governorate[gov.code] = (cities_by_governorate[gov.code] ?? 0) + rows.length;
          }

          page += 1;
          if (cities.length < 100) hasMore = false;
        }
      }
    }

    return {
      ok: true,
      dry_run,
      jenni_governorates_total: jenniGovernorates.length,
      matched_count: matched.length,
      unmatched_local_count: unmatched_local.length,
      unmatched_jenni_count: unmatched_jenni.length,
      prices_upserted_to_jenni_company: prices_upserted,
      cities_synced,
      cities_by_governorate,
      matched,
      unmatched_local,
      unmatched_jenni,
      note: "Jenni public reference API does not expose delivery tariffs; prices are copied from local governorate.delivery_price into Jenni delivery_prices.",
    };
  }
}
