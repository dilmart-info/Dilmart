import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JenniAuthService } from "./jenni-auth.service";
import { JenniProviderException } from "./jenni-provider.exception";
import type {
  JenniAcceptedShipment,
  JenniCreateShipmentPayload,
  JenniHttpMethod,
  JenniProviderUpdate,
  JenniRequestOptions,
  JenniStoreCreatePayload,
  JenniStoreCreateResponse,
  JenniStoreInfo,
  JenniMerchantCreatePayload,
  JenniMerchantCreateResponse,
} from "./jenni.types";

const DEFAULT_TIMEOUT_MS = 10_000;

@Injectable()
export class JenniClientService {
  private readonly logger = new Logger(JenniClientService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly auth: JenniAuthService,
  ) {}

  systemCode(): string {
    return String(this.config.get("JENNI_SYSTEM_CODE") ?? "").trim();
  }

  private baseUrl(): string {
    return String(this.config.get("JENNI_API_BASE_URL") ?? "https://jenni.alzaeemexp.com/api").replace(/\/$/, "");
  }

  // ── Generic request with full HTTP method support, timeout, typed errors ───

  /**
   * Send a request to the Jenni API.
   *
   * Supports GET / POST / PUT / DELETE.
   * Applies a configurable timeout (default 10 s).
   * Returns parsed JSON by default, or raw Buffer when `rawResponse` is true.
   */
  async request<T = unknown>(opts: JenniRequestOptions): Promise<T> {
    const token = await this.auth.getAccessToken();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Build URL with optional query params
    let url = `${this.baseUrl()}${opts.path}`;
    if (opts.query) {
      const qs = new URLSearchParams(opts.query);
      url += `?${qs.toString()}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (opts.method !== "GET" && opts.method !== "DELETE") {
      headers["Content-Type"] = "application/json";
    }
    if (!opts.rawResponse) {
      headers.Accept = "application/json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const diagnosticsEnabled = String(this.config.get("JENNI_DIAGNOSTICS_ENABLED") ?? "").trim().toLowerCase() === "true";
    if (diagnosticsEnabled) {
      const cleanToken = token.trim();
      const dotCount = (cleanToken.match(/\./g) || []).length;
      const startsWithBearer = cleanToken.toLowerCase().startsWith("bearer ");
      const hasBody = opts.body != null;
      const contentTypeSet = headers["Content-Type"] ?? "none";
      
      this.logger.log(
        `Jenni API outgoing request | method=${opts.method} | path=${opts.path} | auth_header_scheme=Bearer | access_token_length=${cleanToken.length} | access_token_dot_count=${dotCount} | access_token_starts_with_bearer=${startsWithBearer} | has_body=${hasBody} | content_type_set=${contentTypeSet}`
      );
    }

    try {
      const response = await fetch(url, {
        method: opts.method,
        headers,
        body: opts.body != null ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });

      // Binary response (e.g. PDF sticker) only when ok
      if (opts.rawResponse && response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        return buffer as unknown as T;
      }

      // Read text response body for any JSON/text/HTML error or normal JSON
      const text = await response.text();
      const contentType = response.headers.get("content-type") ?? "unknown";

      if (!response.ok) {
        // Sanitize secrets from response body (no tokens, passwords, keys, secrets, auth headers, generated passwords)
        const sanitized = text
          ? text.replace(/(password|generated_password|token|secret|key|authorization|access_token|refresh_token)["'\s:]+[^,\}\s\n"']+/gi, '$1: "[REDACTED]"')
          : "";
        const bodyPreview = sanitized.slice(0, 500).replace(/[^\x20-\x7E\u0600-\u06FF]/g, "?");

        this.logger.error(
          `Jenni API request failed | method=${opts.method} | path=${opts.path} | status=${response.status} | content-type=${contentType} | body="${bodyPreview}"`
        );
        throw new JenniProviderException(
          `Jenni API rejected request. status=${response.status} path=${opts.path}`,
          response.status,
          bodyPreview
        );
      }

      // JSON response parsing (only reached when response.ok is true)
      let parsed: T;
      try {
        parsed = text ? (JSON.parse(text) as T) : ({} as T);
      } catch {
        const snippet = (text ?? "").replace(/[^\x20-\x7E\u0600-\u06FF]/g, "?").slice(0, 120);
        this.logger.error(
          `Jenni API non-JSON from ${opts.method} ${opts.path} | status=${response.status} | content-type=${contentType} | body_preview="${snippet}"`,
        );
        throw new ServiceUnavailableException("Jenni API returned an invalid response.");
      }


      return parsed;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        this.logger.error(`Jenni API ${opts.method} ${opts.path} timed out after ${timeoutMs}ms`);
        throw new ServiceUnavailableException(`Jenni API timed out after ${timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Convenience wrappers ───────────────────────────────────────────────────

  /** POST with JSON body, returns parsed JSON. */
  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>({ method: "POST", path, body });
  }

  /** GET with optional query params, returns parsed JSON. */
  async get<T = unknown>(path: string, query?: Record<string, string>): Promise<T> {
    return this.request<T>({ method: "GET", path, query });
  }

  /** PUT with JSON body, returns parsed JSON. */
  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>({ method: "PUT", path, body });
  }

  /** DELETE, returns parsed JSON. */
  async del<T = unknown>(path: string): Promise<T> {
    return this.request<T>({ method: "DELETE", path });
  }

  /** POST that returns raw binary (e.g. PDF sticker). */
  async postBinary(path: string, body: unknown): Promise<Buffer> {
    return this.request<Buffer>({ method: "POST", path, body, rawResponse: true });
  }

  // ── Existing domain methods (preserved interface) ──────────────────────────

  async createShipments(shipments: JenniCreateShipmentPayload[]): Promise<{
    accepted: JenniAcceptedShipment[];
    rejected: Array<{ shipment_number?: string; reason?: string; error_code?: string }>;
  }> {
    const system_code = this.systemCode();
    if (!system_code) throw new ServiceUnavailableException("JENNI_SYSTEM_CODE is not configured.");

    const result = await this.post<{
      accepted_shipments?: JenniAcceptedShipment[];
      rejected_shipments?: Array<{ shipment_number?: string; reason?: string; error_code?: string }>;
    }>("/v2/shipments/create", { system_code, shipments });

    return {
      accepted: result.accepted_shipments ?? [],
      rejected: result.rejected_shipments ?? [],
    };
  }

  async queryShipments(input: { shipment_ids?: Array<number | string>; shipment_numbers?: string[] }) {
    const system_code = this.systemCode();
    if (!system_code) throw new ServiceUnavailableException("JENNI_SYSTEM_CODE is not configured.");

    return this.post<{ shipments?: JenniProviderUpdate[]; data?: JenniProviderUpdate[] }>("/v2/shipments/query", {
      system_code,
      ...input,
    });
  }

  /** Public geographic reference; auth used only if Jenni requires it. */
  async listGovernorates() {
    return this.get("/v2/reference/governorates");
  }

  async listCitiesPage(governorate_code: string, page = 1, size = 100) {
    return this.get("/v2/reference/cities", {
      governorate_code,
      page: String(page),
      size: String(Math.min(100, Math.max(1, size))),
    });
  }

  /** Fetch sticker PDF as raw binary Buffer. */
  async fetchStickerPdf(shipmentNumbers: string[], widthMm = 100, heightMm = 150): Promise<Buffer> {
    return this.postBinary("/v2/shipments/stickers", {
      shipment_numbers: shipmentNumbers,
      width_mm: widthMm,
      height_mm: heightMm,
    });
  }

  /** Cancel a shipment in Jenni. */
  async cancelShipment(shipmentId: number | string): Promise<unknown> {
    return this.del(`/v2/orders/${shipmentId}`);
  }

  /** Modify COD amount on a shipment. */
  async modifyShipmentCod(shipmentId: number | string, amountIqd: number): Promise<unknown> {
    return this.put("/v2/shipments/edit", { shipment_id: shipmentId, amount_iqd: amountIqd });
  }

  // ── Merchant Management (Phase 2F) ──────────────────────────────────────────

  /** Create a new Merchant in Jenni. */
  async createMerchant(payload: JenniMerchantCreatePayload): Promise<JenniMerchantCreateResponse> {
    return this.post<JenniMerchantCreateResponse>("/v2/merchant-management/create", payload);
  }

  // ── Store Management (Phase 2A) ─────────────────────────────────────────────

  /** Create a new Store in Jenni. */
  async createStore(payload: JenniStoreCreatePayload): Promise<JenniStoreCreateResponse> {
    return this.post<JenniStoreCreateResponse>("/v2/stores/create", payload);
  }

  /** Fetch the current account's stores (paginated). */
  async listStores(page = 1, size = 50): Promise<{ data: JenniStoreInfo[] }> {
    return this.get<{ data: JenniStoreInfo[] }>("/v2/merchants/my-stores", {
      page: String(page),
      size: String(Math.min(100, Math.max(1, size))),
    });
  }

  /** Find a specific store by ID from the account's store list. */
  async getStore(storeId: number): Promise<JenniStoreInfo | null> {
    const result = await this.listStores(1, 100);
    return result.data?.find((s) => s.store_id === storeId || s.id === storeId) ?? null;
  }
}
