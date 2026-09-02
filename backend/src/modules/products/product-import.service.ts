import { parse as parseCsvSync } from "csv-parse/sync";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";
import { AuditService } from "../audit/audit.service";
import { CategoriesService } from "../categories/categories.service";
import { CategoryAssignErrors } from "../categories/category-assignability";
import {
  ShortDescriptionErrors,
  codePointLength,
  validateShortDescription,
} from "./short-description";
import { PRODUCT_NOT_READY_CODE, getBlockingActivationChecks } from "./product-readiness";

/**
 * Product CSV import — rebuilt for DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001 (Gate 1, then
 * corrected in Gate 2 to move Confirm behind an atomic Postgres RPC).
 *
 * Safety invariants enforced here (do not weaken without a new governance sign-off):
 * - SKU is required and is the upsert key (`merchant_id` + `merchant_sku`), never name/slug.
 * - Imported products default to `is_active=false, is_published=false,
 *   visibility_status="private", stock=0` — nothing becomes publicly visible just by importing.
 * - A row that DOES ask for `is_active=true` / `is_published=true` / `visibility_status=public`
 *   must pass the same authoritative readiness rules as every other activation path (see
 *   `./product-readiness`), and must be `is_active=true` for the published/public flags to be
 *   accepted at all. Import can never publish a product that `ProductsService` would refuse to
 *   activate. The confirm RPC repeats the check as an independent DB-level gatekeeper (see
 *   supabase/migrations/20260819120000_product_import_confirm_readiness.sql).
 * - Slugs are stable and deterministic (`{slugify(name)}-{sku}`), computed once here at PREVIEW
 *   time (pure function of name+sku, no DB access) so re-importing the same SKU never changes
 *   the product's URL. `products.slug` has a DB-wide UNIQUE constraint, so on a genuine
 *   cross-merchant collision the RPC appends a short deterministic hash of `merchant_id` —
 *   never a random suffix, and never on update (an existing product's slug is never touched).
 * - Confirm is one-time (claimed via `status = 'previewed' → 'processing'` inside the RPC),
 *   scoped to one `merchant_id`, and fully atomic: `product_import_confirm_atomic` performs the
 *   claim + validation + every row upsert + finalize (+ optional audit row) in ONE Postgres
 *   transaction. See the migration file for the exact concurrency/rollback contract — on any
 *   failure the whole transaction (including the claim) rolls back, leaving the session
 *   `previewed` and safe to retry. This class no longer performs, or needs to perform, any
 *   compensating deletes/updates.
 * - Admin import (`previewForAdmin`/`confirmForAdmin`) works for a merchant in ANY status
 *   (including `draft`) and never writes to `merchants.status` — importing a catalog must not
 *   be able to activate a merchant as a side effect. If the merchant is not `active`, any CSV
 *   row that tries to set `is_active=true`, `is_published=true`, or `visibility_status=public`
 *   is rejected as invalid at preview time (see `buildImportRows`) — a draft merchant's CSV can
 *   never sneak a publish flag through import. The atomic confirm RPC independently
 *   force-overrides the same fields to safe defaults for a non-active merchant as a second,
 *   DB-level gatekeeper (defense in depth against a tampered/stale preview payload).
 * - CSV parsing is strict: every data row must have exactly as many fields as the header
 *   (`relax_column_count: false`), header names must be non-blank and unique, and only a known
 *   allowlist of column names is accepted (`KNOWN_CSV_COLUMNS`) — an unrecognized/typo'd column
 *   fails the whole upload instead of being silently ignored.
 */

export const PRODUCT_IMPORT_TEMPLATE_HEADER =
  "name,short_description,description,category,price,discount_price,stock,sku,brand,size,is_active,is_published,visibility_status,image_url\n" +
  "عطر فلفت عود,عطر شرقي خشبي للجنسين بحجم 100 مل من لطافة يجمع لمسات التوابل والجلد والعود والعنبر في طابع دافئ ومتوازن.,يفتتح بالهيل والبرغموت ثم ينتقل إلى قلب من أوراق البنفسج والباتشولي ويستقر على الجلد والعود والعنبر.,العطور والمعطرات > العطور,45000,40000,0,ARD-EXAMPLE,Lattafa,100 مل,false,false,private,\n";

/** Example hierarchical category values accepted in `category` column:
 * - leaf name/slug/id
 * - `العطور والمعطرات > العطور`
 * - `fragrances-and-scents > perfumes`
 * Separators: `>` or `›`. Ambiguous matches fail closed.
 *
 * `short_description` is required for every import row (40–280 chars after trim).
 * `description` remains optional detailed copy.
 */

/** Only Supabase Storage objects under this project's public `products` bucket are trusted. */
const ALLOWED_IMAGE_URL_PREFIX = "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/";

/**
 * Strict allowlist of known CSV header columns. `compare_at_price` is legacy-optional (parsed
 * for back-compat, never written to `discount_price` — see `legacy_compare_at_price`). Any
 * header NOT in this set is rejected at parse time — unknown/typo'd columns must fail loudly
 * instead of being silently ignored, which could otherwise let a malformed or hostile CSV smuggle
 * unexpected columns through undetected.
 */
const KNOWN_CSV_COLUMNS = new Set([
  "name",
  "short_description",
  "description",
  "category",
  "price",
  "discount_price",
  "stock",
  "sku",
  "brand",
  "size",
  "is_active",
  "is_published",
  "visibility_status",
  "image_url",
  "compare_at_price",
]);

const ALLOWED_VISIBILITY_STATUSES = ["public", "private", "archived"] as const;
type VisibilityStatus = (typeof ALLOWED_VISIBILITY_STATUSES)[number];

const SESSION_TTL_MS = 60 * 60 * 1000; // ~1 hour, overriding the table's own (longer) default.

/** CSV upload hard limits — enforced before/while parsing, never after loading an unbounded file. */
const MAX_UPLOAD_BYTES = 1_000_000; // 1MB
const MAX_ROWS = 500;
const MAX_FIELD_CHARS = 5000;

type ImportRowStatus = "valid" | "invalid" | "warning";

export interface NormalizedImportRow {
  name: string;
  short_description: string;
  short_description_char_count: number;
  description?: string;
  category_id: string;
  category_name: string;
  price: number;
  discount_price: number | null;
  stock: number;
  sku: string;
  brand: string | null;
  sizes: string[];
  is_active: boolean;
  is_published: boolean;
  visibility_status: VisibilityStatus;
  image_url: string | null;
  /**
   * Stable, deterministic slug base (`{slugify(name)}-{sku}`), computed here at preview time.
   * The confirm RPC uses this directly for INSERT and only appends a merchant-hash suffix on a
   * genuine global slug collision — it never re-derives the slug from name/sku itself.
   */
  slug: string;
  /** Back-compat only. Parsed so old templates don't crash import; NEVER written to discount_price. */
  legacy_compare_at_price?: number;
}

export interface ImportRowResult {
  row_number: number;
  status: ImportRowStatus;
  normalized: NormalizedImportRow;
  errors: string[];
  warnings: string[];
}

export interface PreviewSummary {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  warnings_count: number;
}

export interface PreviewPayload {
  summary: PreviewSummary;
  rows: ImportRowResult[];
  confirm_result?: ConfirmReport;
}

export interface ConfirmReportRow {
  row_number: number;
  sku: string;
  action: "created" | "updated" | "skipped" | "failed";
  product_id?: string | null;
  message?: string;
}

export interface ConfirmReport {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row_number: number; sku?: string; message: string }>;
  rows: ConfirmReportRow[];
}

type Actor = { actor_role?: string; actor_id?: string };

@Injectable()
export class ProductImportService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly scopeResolver: ScopeResolverService,
    private readonly auditService: AuditService,
    private readonly categoriesService: CategoriesService,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────

  async getImportTemplate() {
    return {
      filename: "merchant-products-template.csv",
      contentType: "text/csv; charset=utf-8",
      body: PRODUCT_IMPORT_TEMPLATE_HEADER,
    };
  }

  /** Merchant self-service import. Requires an active merchant (unchanged from prior behavior). */
  async previewForMerchant(
    fileBuffer: Buffer,
    filename: string | undefined,
    merchantId: string,
    actor?: Actor,
  ) {
    if (!merchantId) {
      throw new BadRequestException("merchant_id is required.");
    }
    const resolvedMerchantId = await this.resolveMerchantForMerchantActor(merchantId, actor ?? {});
    // resolveMerchantForMerchantActor() already asserts status === 'active' above.
    return this.runPreview(resolvedMerchantId, fileBuffer, filename, actor?.actor_id, "active");
  }

  async confirmForMerchant(
    importId: string,
    merchantId: string,
    actor?: Actor,
  ) {
    if (!merchantId) {
      throw new BadRequestException("merchant_id is required.");
    }
    const resolvedMerchantId = await this.resolveMerchantForMerchantActor(merchantId, actor ?? {});
    return this.runConfirm(resolvedMerchantId, importId, actor ?? {}, { isAdmin: false });
  }

  /**
   * Admin-on-behalf-of-merchant import. Merchant may be in ANY status (including `draft`) —
   * this is exactly the pilot use case: loading a catalog before the merchant goes live.
   * Never touches `merchants.status`.
   */
  async previewForAdmin(merchantId: string, fileBuffer: Buffer, filename: string | undefined, actor?: Actor) {
    this.assertAdminActor(actor);
    if (!merchantId) throw new BadRequestException("merchantId is required.");
    const merchant = await this.ensureMerchantExists(merchantId);
    return this.runPreview(merchantId, fileBuffer, filename, actor?.actor_id, merchant.status);
  }

  async confirmForAdmin(merchantId: string, importId: string, actor?: Actor) {
    this.assertAdminActor(actor);
    if (!merchantId) throw new BadRequestException("merchantId is required.");
    await this.ensureMerchantExists(merchantId);
    return this.runConfirm(merchantId, importId, actor ?? {}, { isAdmin: true });
  }

  // ── Actor / merchant resolution ───────────────────────────────────────

  private isMerchantRole(role?: string) {
    return role === "merchant_owner" || role === "merchant_manager" || role === "merchant_staff";
  }

  private isAdminRole(role?: string) {
    return role === "super_admin" || role === "admin";
  }

  private assertAdminActor(actor?: Actor) {
    if (!this.isAdminRole(actor?.actor_role)) {
      throw new ForbiddenException("Admin role required.");
    }
  }

  private async resolveMerchantForMerchantActor(requestedMerchantId: string, actor: Actor) {
    if (!this.isMerchantRole(actor?.actor_role)) {
      throw new ForbiddenException("Merchant role required.");
    }
    if (!requestedMerchantId) {
      throw new BadRequestException("merchant_id is required.");
    }
    const merchantId = await this.scopeResolver.resolveMerchantScope(requestedMerchantId, actor?.actor_role, actor?.actor_id);
    if (!merchantId || merchantId !== requestedMerchantId) {
      throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    }
    await this.ensureMerchantActive(merchantId);
    return merchantId;
  }

  private async ensureMerchantActive(merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client.from("merchants").select("status").eq("id", merchantId).maybeSingle();
    if (error) throw error;
    if (!data?.status || data.status !== "active") {
      throw new ForbiddenException("Merchant is pending approval or not active.");
    }
  }

  /** Admin path: merchant must exist, but ANY status is allowed. Never mutates the merchant row. */
  private async ensureMerchantExists(merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client.from("merchants").select("id,status").eq("id", merchantId).maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new NotFoundException("Merchant not found.");
    return data as { id: string; status: string };
  }

  // ── CSV parsing ───────────────────────────────────────────────────────
  //
  // Uses `csv-parse` (RFC 4180) instead of a handwritten line splitter so quoted commas,
  // escaped ("") quotes, and multiline (embedded \n) fields are handled correctly — the old
  // handwritten parser split on raw `\n` BEFORE tokenizing quotes, which silently corrupted any
  // field containing a real newline. `bom: true` strips a leading UTF-8 BOM for us.

  private parseCsv(fileBuffer: Buffer) {
    if (fileBuffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`CSV file exceeds the maximum allowed size of ${MAX_UPLOAD_BYTES} bytes.`);
    }

    let records: string[][];
    try {
      records = parseCsvSync(fileBuffer, {
        bom: true,
        trim: true,
        skip_empty_lines: true,
        // Strict on purpose: a data row with a different number of fields than the header is a
        // malformed/truncated CSV, not something to silently tolerate. `relax_column_count: true`
        // (the prior setting) let csv-parse pad/drop mismatched rows without any signal, which
        // could silently misalign a row's values against the wrong header columns.
        relax_column_count: false,
      }) as string[][];
    } catch (error: any) {
      throw new BadRequestException(`CSV file could not be parsed: ${error?.message ?? "malformed CSV."}`);
    }

    if (!records.length) return { header: [] as string[], rows: [] as string[][] };

    const rawHeader = records[0].map((h) => String(h ?? "").trim().toLowerCase());
    const dataRecords = records.slice(1);

    if (rawHeader.some((h) => h === "")) {
      throw new BadRequestException("CSV header row contains one or more blank column names.");
    }

    const seenHeaders = new Set<string>();
    const duplicateHeaders = new Set<string>();
    for (const h of rawHeader) {
      if (seenHeaders.has(h)) duplicateHeaders.add(h);
      seenHeaders.add(h);
    }
    if (duplicateHeaders.size > 0) {
      throw new BadRequestException(`CSV header row contains duplicate column(s): ${[...duplicateHeaders].join(", ")}.`);
    }

    // Strict allowlist: unknown/typo'd optional columns are rejected rather than silently
    // ignored — see KNOWN_CSV_COLUMNS.
    const unknownHeaders = rawHeader.filter((h) => !KNOWN_CSV_COLUMNS.has(h));
    if (unknownHeaders.length > 0) {
      throw new BadRequestException(
        `CSV header row contains unknown column(s): ${unknownHeaders.join(", ")}. Allowed columns: ${[...KNOWN_CSV_COLUMNS].join(", ")}.`,
      );
    }

    const header = rawHeader;

    if (dataRecords.length > MAX_ROWS) {
      throw new BadRequestException(`CSV file exceeds the maximum allowed rows (${MAX_ROWS}).`);
    }

    // Explicit strict column-count check in addition to `relax_column_count: false` above — this
    // gives a precise, row-numbered error message instead of relying solely on the parser's own
    // (less specific) internal error.
    dataRecords.forEach((record, i) => {
      if (record.length !== header.length) {
        throw new BadRequestException(
          `CSV row ${i + 2} has ${record.length} column(s) but the header has ${header.length}.`,
        );
      }
    });

    const rows = dataRecords.map((record) =>
      record.map((field) => {
        const value = String(field ?? "");
        if (value.length > MAX_FIELD_CHARS) {
          throw new BadRequestException(`CSV field exceeds the maximum allowed length (${MAX_FIELD_CHARS} characters).`);
        }
        return value.trim();
      }),
    );

    return { header, rows };
  }

  // ── Normalization helpers ────────────────────────────────────────────

  private slugify(value: string) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private buildStableSlug(name: string, normalizedSku: string) {
    const base = this.slugify(name) || "product";
    const skuPart = this.slugify(normalizedSku) || normalizedSku.toLowerCase();
    return `${base}-${skuPart}`;
  }

  private parseBooleanLike(value: string | undefined, defaultValue: boolean) {
    const v = String(value ?? "").trim().toLowerCase();
    if (!v) return defaultValue;
    return ["true", "yes", "1", "y", "on"].includes(v);
  }

  private normalizeSku(raw: string | undefined) {
    return String(raw ?? "").trim().toUpperCase();
  }

  private isAllowedImageUrl(url: string) {
    return url.startsWith(ALLOWED_IMAGE_URL_PREFIX);
  }

  private async resolveCategoriesMap(parsed: { header: string[]; rows: string[][] }) {
    const idx = parsed.header.indexOf("category");
    const tokens = new Set<string>();
    for (const row of parsed.rows) {
      const raw = idx === -1 ? "" : String(row[idx] ?? "").trim();
      if (raw) tokens.add(raw);
    }

    const byToken = new Map<string, { id: string; name: string } | { error: string }>();
    for (const token of tokens) {
      try {
        const resolved = await this.categoriesService.resolveCategoryToken(token);
        byToken.set(token.toLowerCase(), { id: resolved.id, name: resolved.name });
      } catch (err: any) {
        const code = err?.response?.code || err?.response?.message || err?.message || CategoryAssignErrors.CATEGORY_NOT_FOUND;
        byToken.set(token.toLowerCase(), { error: String(code) });
      }
    }
    return byToken;
  }

  // ── Row validation (pure — no I/O beyond the pre-fetched categories map) ─

  /**
   * @param merchantStatus Current `merchants.status` for the target merchant. When it is not
   * `"active"` (e.g. the admin pilot-import-before-launch use case), any row that tries to set
   * `is_active=true`, `is_published=true`, or `visibility_status=public` is rejected as invalid
   * — a draft merchant's CSV can never sneak a publish flag through import. This mirrors, at the
   * TS layer, the force-override the atomic confirm RPC applies as its own independent
   * gatekeeper (see supabase/migrations/20260801190000_product_import_confirm_atomic.sql).
   */
  private buildImportRows(
    parsed: { header: string[]; rows: string[][] },
    categoriesMap: Map<string, { id: string; name: string } | { error: string }>,
    merchantStatus: string,
  ) {
    const idx = (name: string) => parsed.header.indexOf(name);
    const get = (row: string[], col: string) => {
      const colIdx = idx(col);
      return colIdx === -1 ? "" : String(row[colIdx] ?? "").trim();
    };

    const seenSkus = new Set<string>();
    const rows: ImportRowResult[] = [];
    let validRows = 0;
    let invalidRows = 0;
    let warningsCount = 0;

    for (let i = 0; i < parsed.rows.length; i += 1) {
      const row = parsed.rows[i];
      const rowNumber = i + 2;

      const name = get(row, "name");
      const shortDescriptionRaw = get(row, "short_description");
      const description = get(row, "description") || undefined;
      const categoryToken = get(row, "category");
      const priceRaw = get(row, "price");
      const discountRaw = get(row, "discount_price");
      const compareAtRaw = get(row, "compare_at_price"); // back-compat only
      const stockRaw = get(row, "stock");
      const skuRaw = get(row, "sku");
      const brandRaw = get(row, "brand");
      const sizeRaw = get(row, "size");
      const isActiveRaw = get(row, "is_active");
      const isPublishedRaw = get(row, "is_published");
      const visibilityRaw = get(row, "visibility_status").toLowerCase();
      const imageUrlRaw = get(row, "image_url");

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!name || name.length < 2 || name.length > 180) {
        errors.push("name is required (2..180 chars).");
      }

      const shortCheck = validateShortDescription(shortDescriptionRaw, { required: true });
      let shortDescription = "";
      let shortDescriptionCharCount = 0;
      if (!shortCheck.ok) {
        errors.push(`${shortCheck.code}: ${shortCheck.message}`);
      } else {
        shortDescription = shortCheck.value ?? "";
        shortDescriptionCharCount = codePointLength(shortDescription);
      }

      const price = Number(priceRaw);
      const priceValid = Boolean(priceRaw) && Number.isFinite(price) && price > 0;
      if (!priceValid) {
        errors.push("price must be numeric and > 0.");
      }

      let discountPrice: number | null = null;
      if (discountRaw) {
        const parsedDiscount = Number(discountRaw);
        if (!Number.isFinite(parsedDiscount) || parsedDiscount <= 0 || (priceValid && parsedDiscount >= price)) {
          errors.push("discount_price must be numeric, > 0, and < price.");
        } else {
          discountPrice = parsedDiscount;
        }
      }

      let legacyCompareAtPrice: number | undefined;
      if (compareAtRaw) {
        const parsedCompare = Number(compareAtRaw);
        if (Number.isFinite(parsedCompare)) {
          legacyCompareAtPrice = parsedCompare;
        }
        warnings.push("compare_at_price is ignored by import; use discount_price instead.");
      }

      let stock = 0;
      if (stockRaw) {
        const parsedStock = Number(stockRaw);
        if (!Number.isInteger(parsedStock) || parsedStock < 0) {
          errors.push("stock must be an integer >= 0.");
        } else {
          stock = parsedStock;
        }
      }

      const categoryLookup = categoryToken ? categoriesMap.get(categoryToken.toLowerCase()) : undefined;
      const category =
        categoryLookup && "id" in categoryLookup
          ? { id: categoryLookup.id, name: categoryLookup.name }
          : undefined;
      if (!categoryToken) {
        errors.push("category must match existing category by name/slug/id or Parent > Child path.");
      } else if (!category) {
        const detail =
          categoryLookup && "error" in categoryLookup ? ` (${categoryLookup.error})` : "";
        errors.push(
          `category must match existing assignable category by name/slug/id or Parent > Child path.${detail}`,
        );
      }

      const sku = this.normalizeSku(skuRaw);
      if (!sku) {
        errors.push("sku is required.");
      } else if (seenSkus.has(sku)) {
        errors.push("duplicate SKU inside file.");
      } else {
        seenSkus.add(sku);
      }

      const brand = brandRaw || null;
      const sizes = sizeRaw
        ? sizeRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      const isActive = this.parseBooleanLike(isActiveRaw, false);
      const isPublished = this.parseBooleanLike(isPublishedRaw, false);

      let visibilityStatus: VisibilityStatus = "private";
      if (visibilityRaw) {
        if (!(ALLOWED_VISIBILITY_STATUSES as readonly string[]).includes(visibilityRaw)) {
          errors.push("visibility_status must be one of public, private, archived.");
        } else {
          visibilityStatus = visibilityRaw as VisibilityStatus;
        }
      }

      let imageUrl: string | null = null;
      if (imageUrlRaw) {
        if (!this.isAllowedImageUrl(imageUrlRaw)) {
          errors.push(`image_url must start with ${ALLOWED_IMAGE_URL_PREFIX}`);
        } else {
          imageUrl = imageUrlRaw;
        }
      }

      // Draft-merchant safety: reject (not silently override) any row attempting to publish
      // while the merchant is not active. See buildImportRows() doc comment.
      if (merchantStatus !== "active" && (isActive || isPublished || visibilityStatus === "public")) {
        errors.push(
          "merchant is not active; import cannot set is_active=true, is_published=true, or visibility_status=public.",
        );
      }

      // Readiness invariant (DilMart-STORE-PRODUCT-READINESS-INVARIANT-001): a row that asks to
      // be active/published/public must satisfy exactly the same authoritative readiness rules
      // as `ProductsService` activation — import is not a back door around them.
      const wantsPublicState = isActive || isPublished || visibilityStatus === "public";
      if (wantsPublicState) {
        if (!isActive) {
          errors.push("is_published=true / visibility_status=public require is_active=true.");
        }
        if (visibilityStatus === "archived") {
          // Preview and the confirm RPC must agree: the RPC raises IMPORT_ROW_NOT_READY for an
          // active archived row, so a preview that accepted it could never be confirmed.
          errors.push(
            "is_active=true / is_published=true cannot be combined with visibility_status=archived.",
          );
        }
        const blocking = getBlockingActivationChecks({
          name,
          slug: sku ? this.buildStableSlug(name, sku) : "",
          price: Number.isFinite(price) ? price : 0,
          category_id: category?.id ?? "",
          images: imageUrl ? [imageUrl] : [],
          stock,
          discount_price: discountPrice,
          description,
        });
        if (blocking.length > 0) {
          errors.push(
            `${PRODUCT_NOT_READY_CODE}: row is not ready for activation (${blocking.map((item) => item.key).join(", ")}).`,
          );
        }
      }

      let status: ImportRowStatus = "valid";
      if (errors.length > 0) status = "invalid";
      else if (warnings.length > 0) status = "warning";

      if (status === "invalid") invalidRows += 1;
      else validRows += 1;
      warningsCount += warnings.length;

      rows.push({
        row_number: rowNumber,
        status,
        normalized: {
          name,
          short_description: shortDescription,
          short_description_char_count: shortDescriptionCharCount,
          description,
          category_id: category?.id ?? "",
          category_name: category?.name ?? "",
          price: Number.isFinite(price) ? price : 0,
          discount_price: discountPrice,
          stock,
          sku,
          brand,
          sizes,
          is_active: isActive,
          is_published: isPublished,
          visibility_status: visibilityStatus,
          image_url: imageUrl,
          // Computed even for invalid rows for consistency; the confirm RPC never sees invalid
          // rows anyway (blocked before any product write — see runConfirm/IMPORT_HAS_INVALID_ROWS).
          slug: sku ? this.buildStableSlug(name, sku) : "",
          legacy_compare_at_price: legacyCompareAtPrice,
        },
        errors,
        warnings,
      });
    }

    return { rows, validRows, invalidRows, warningsCount };
  }

  // ── Preview ───────────────────────────────────────────────────────────

  private async runPreview(
    merchantId: string,
    fileBuffer: Buffer,
    filename: string | undefined,
    createdBy: string | undefined,
    merchantStatus: string,
  ) {
    const parsed = this.parseCsv(fileBuffer);
    if (!parsed.header.length) throw new BadRequestException("CSV file is empty.");

    const requiredColumns = ["name", "short_description", "price", "category", "sku"];
    const missingColumns = requiredColumns.filter((col) => !parsed.header.includes(col));
    if (missingColumns.length > 0) {
      throw new BadRequestException(`Missing required columns: ${missingColumns.join(", ")}`);
    }

    const categoriesMap = await this.resolveCategoriesMap(parsed);
    const { rows, validRows, invalidRows, warningsCount } = this.buildImportRows(parsed, categoriesMap, merchantStatus);

    const previewPayload: PreviewPayload = {
      summary: {
        total_rows: parsed.rows.length,
        valid_rows: validRows,
        invalid_rows: invalidRows,
        warnings_count: warningsCount,
      },
      rows,
    };

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const { data: session, error: sessionError } = await this.supabaseAdmin.client
      .from("product_import_sessions")
      .insert({
        merchant_id: merchantId,
        created_by: createdBy ?? null,
        status: "previewed",
        original_filename: filename ?? null,
        total_rows: parsed.rows.length,
        valid_rows: validRows,
        invalid_rows: invalidRows,
        preview_payload: previewPayload,
        expires_at: expiresAt,
      } as any)
      .select("id")
      .single();
    if (sessionError) throw sessionError;

    return {
      import_id: (session as any).id,
      ...previewPayload,
    };
  }

  // ── Confirm ───────────────────────────────────────────────────────────

  private async loadSession(importId: string, merchantId: string) {
    const { data: session, error } = await this.supabaseAdmin.client
      .from("product_import_sessions")
      .select("*")
      .eq("id", importId)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (error) throw error;
    if (!session) throw new ForbiddenException("Import session not found in merchant scope.");
    return session as any;
  }

  /**
   * Confirm is now a single call into `product_import_confirm_atomic` (see
   * `supabase/migrations/20260801190000_product_import_confirm_atomic.sql`). All the
   * claim/validate/upsert-every-row/finalize/audit work happens inside ONE Postgres
   * transaction; there is no compensation code here because there is nothing left to
   * compensate — a failure rolls the whole transaction back automatically.
   */
  private async runConfirm(merchantId: string, importId: string, actor: Actor, opts: { isAdmin: boolean }): Promise<ConfirmReport> {
    const session = await this.loadSession(importId, merchantId);

    // Defense in depth: the RPC re-checks this authoritatively (and is what actually enforces
    // it), but failing fast here avoids a round-trip for the common "fix your CSV" case and
    // guarantees zero product writes were ever attempted for a batch we already know is invalid.
    const payload = (session.preview_payload ?? {}) as PreviewPayload;
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const hasInvalidRow = Number(session.invalid_rows ?? 0) > 0 || rows.some((r) => r.status === "invalid");
    if (hasInvalidRow) {
      throw new BadRequestException("Import session has invalid rows; fix the CSV and re-preview before confirming.");
    }

    const { data, error } = await this.supabaseAdmin.client.rpc("product_import_confirm_atomic", {
      p_import_id: importId,
      p_merchant_id: merchantId,
      p_actor_id: actor?.actor_id ?? null,
      p_actor_role: actor?.actor_role ?? null,
      p_write_audit: Boolean(opts.isAdmin),
    } as any);

    if (error) {
      await this.handleConfirmRpcError(error, importId, merchantId);
    }

    return data as ConfirmReport;
  }

  /** Maps `product_import_confirm_atomic` error codes to HTTP exceptions. Always throws. */
  private async handleConfirmRpcError(error: any, importId: string, merchantId: string): Promise<never> {
    const message = String(error?.message ?? "");

    if (message.includes("IMPORT_SESSION_NOT_FOUND")) {
      throw new ForbiddenException("Import session not found in merchant scope.");
    }

    if (message.includes("IMPORT_SESSION_EXPIRED")) {
      // The RPC transaction rolled back (see migration file design note), so `status` is still
      // 'previewed' in the DB even though it is actually expired. This best-effort, separate
      // (non-atomic-critical) write just labels it correctly for the UI/audit trail — it has no
      // bearing on correctness because `expires_at` is re-checked by the RPC on every attempt.
      await this.supabaseAdmin.client
        .from("product_import_sessions")
        .update({ status: "expired" } as any)
        .eq("id", importId)
        .eq("merchant_id", merchantId)
        .eq("status", "previewed");
      throw new BadRequestException("Import session expired.");
    }

    if (message.includes("IMPORT_SESSION_CLAIM_FAILED")) {
      throw new BadRequestException("Import session already processed or is currently being processed.");
    }

    if (message.includes("IMPORT_HAS_INVALID_ROWS")) {
      throw new BadRequestException("Import session has invalid rows; fix the CSV and re-preview before confirming.");
    }

    if (message.includes("IMPORT_SKU_AMBIGUOUS")) {
      // 409: the request itself is well-formed, but the current DB state (pre-existing duplicate
      // merchant_sku rows) makes it impossible to determine which product to update.
      throw new ConflictException(
        "Import cannot proceed: one or more SKUs match more than one existing product for this merchant. Resolve the duplicate SKUs before importing.",
      );
    }

    if (message.includes("IMPORT_PAYLOAD_INTEGRITY_FAILED")) {
      throw new BadRequestException("Import payload failed server-side integrity validation; re-preview the CSV and try again.");
    }

    if (message.includes("IMPORT_ROW_INVALID_PRICE")) {
      throw new BadRequestException("Import payload contains a row with an invalid price; re-preview the CSV and try again.");
    }

    if (message.includes("IMPORT_ROW_INVALID_STOCK")) {
      throw new BadRequestException("Import payload contains a row with an invalid stock value; re-preview the CSV and try again.");
    }

    if (message.includes("IMPORT_ROW_INVALID_DISCOUNT_PRICE")) {
      throw new BadRequestException("Import payload contains a row with an invalid discount_price; re-preview the CSV and try again.");
    }

    if (message.includes("IMPORT_ROW_INVALID_CATEGORY")) {
      throw new BadRequestException(
        `${message.includes("parent with active children") ? message : "IMPORT_ROW_INVALID_CATEGORY"}: Import payload contains a row with an invalid, inactive, or non-leaf category; re-preview the CSV and try again.`,
      );
    }

    if (message.includes("IMPORT_ROW_INVALID_VISIBILITY")) {
      throw new BadRequestException("Import payload contains a row with an invalid visibility_status; re-preview the CSV and try again.");
    }

    if (message.includes("IMPORT_ROW_INVALID_IMAGE")) {
      throw new BadRequestException("Import payload contains a row with a disallowed image_url; re-preview the CSV and try again.");
    }

    if (message.includes("IMPORT_ROW_NOT_READY")) {
      // DB-level readiness gatekeeper tripped (stale pre-deploy preview payload, or a tampered
      // one). Zero product writes happened; the session is back at 'previewed'.
      throw new BadRequestException({
        message:
          "Import payload contains a row that asks to be active/published/public without meeting product readiness; re-preview the CSV and try again.",
        code: PRODUCT_NOT_READY_CODE,
      });
    }

    if (message.includes("IMPORT_ROW_SHORT_DESCRIPTION_REQUIRED")) {
      throw new BadRequestException(
        "IMPORT_ROW_SHORT_DESCRIPTION_REQUIRED: Import payload is missing short_description; re-preview the CSV and try again.",
      );
    }
    if (message.includes("IMPORT_ROW_SHORT_DESCRIPTION_TOO_SHORT")) {
      throw new BadRequestException(
        "IMPORT_ROW_SHORT_DESCRIPTION_TOO_SHORT: Import payload short_description is too short; re-preview the CSV and try again.",
      );
    }
    if (message.includes("IMPORT_ROW_SHORT_DESCRIPTION_TOO_LONG")) {
      throw new BadRequestException(
        "IMPORT_ROW_SHORT_DESCRIPTION_TOO_LONG: Import payload short_description is too long; re-preview the CSV and try again.",
      );
    }
    if (message.includes("IMPORT_ROW_SHORT_DESCRIPTION_INVALID")) {
      throw new BadRequestException(
        "IMPORT_ROW_SHORT_DESCRIPTION_INVALID: Import payload short_description is invalid; re-preview the CSV and try again.",
      );
    }

    if (message.includes("IMPORT_ROW_MISSING_SKU") || message.includes("IMPORT_ROW_MISSING_SLUG")) {
      throw new BadRequestException("Import payload contains a row missing a required field; re-preview the CSV and try again.");
    }

    throw error;
  }
}
