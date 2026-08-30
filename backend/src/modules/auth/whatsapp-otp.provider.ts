import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { maskPhoneForLogs } from "./otp-phone.util";

/**
 * Meta WhatsApp Cloud API authentication template styles.
 * Ported from DilMart-main WhatsAppOtpProvider (delivery only — no SMS routing).
 */
export type OtpTemplateType =
  | "AUTH_COPY_CODE"
  | "AUTH_ONE_TAP"
  | "AUTH_GENERIC"
  | "AUTH_COPY_CODE_NOBD"
  | "AUTH_CC_NOBD"
  | "AUTH_BODY_URL"
  | "AUTH_ZERO_PARAM"
  | "AUTH_COPY_CODE_EXPIRY";

export type WhatsAppMode = "disabled" | "sandbox" | "live";

/** Per-call overrides. Only narrowing is honoured — never widening past the channel cap. */
export interface WhatsAppSendOptions {
  timeoutMs?: number;
}

export interface WhatsAppOtpSendResult {
  success: boolean;
  /** Meta accepted the send request (wamid) — not end-user delivery confirmation. */
  providerAcceptedMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  failureClass?:
    | "CONFIG_ERROR"
    | "TEMPLATE_ERROR"
    | "PROVIDER_REJECTED"
    | "PROVIDER_TIMEOUT"
    | "DELIVERY_FAILED";
  latencyMs: number;
}

@Injectable()
export class WhatsAppOtpProvider {
  readonly providerName = "META_WHATSAPP";
  private readonly logger = new Logger(WhatsAppOtpProvider.name);

  /** Injectable for unit tests — defaults to global fetch. */
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(private readonly config: ConfigService) {}

  getMode(): WhatsAppMode {
    const raw = (this.config.get<string>("OTP_WHATSAPP_MODE") || "").trim().toLowerCase();
    if (raw === "sandbox" || raw === "live" || raw === "disabled") return raw;
    return "disabled";
  }

  /**
   * Send OTP via Meta authentication template.
   * `destinationE164` must already be E.164 (e.g. +9647XXXXXXXXX).
   * Never logs OTP code, access token, or full phone.
   */
  async sendOtp(
    destinationE164: string,
    code: string,
    options?: WhatsAppSendOptions,
  ): Promise<WhatsAppOtpSendResult> {
    const mode = this.getMode();
    if (mode === "disabled") {
      this.logger.warn("[WHATSAPP] Provider mode is disabled — CONFIG_ERROR");
      return this.configError("WhatsApp OTP channel is disabled (OTP_WHATSAPP_MODE=disabled)");
    }

    const configValidation = this.validateConfig();
    if (!configValidation.ok) {
      this.logger.error(`[WHATSAPP][CONFIG_ERROR] ${configValidation.reason}`);
      return this.configError(configValidation.reason!);
    }

    const cfg = this.getConfig();
    const maskedPhone = maskPhoneForLogs(destinationE164);
    const startTime = Date.now();
    const logPrefix = mode === "sandbox" ? "[WHATSAPP][SANDBOX]" : "[WHATSAPP]";

    try {
      this.logger.log(
        `${logPrefix}[DISPATCH] template="${cfg.templateName}" type=${cfg.templateType} ` +
          `mode=${mode} to=${maskedPhone}`,
      );

      const payload = this.buildPayload(destinationE164, code, cfg);
      const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;

      // Callers with a tighter deadline than the channel default may override it. The
      // Supabase auth hook does, because Supabase drops the hook after 5s and a request
      // still in flight past that point can only produce a message the user will never be
      // able to use.
      const effectiveTimeoutMs =
        Number.isFinite(options?.timeoutMs) && (options!.timeoutMs as number) > 0
          ? Math.min(options!.timeoutMs as number, cfg.timeoutMs)
          : cfg.timeoutMs;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.accessToken}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const latencyMs = Date.now() - startTime;
      const data = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { code?: number; message?: string; type?: string };
      };

      if (response.ok && data?.messages?.[0]?.id) {
        const messageId = data.messages[0].id!;
        this.logger.log(
          `${logPrefix}[ACCEPTED] to=${maskedPhone} providerAcceptedMessageId=${messageId} (+${latencyMs}ms)`,
        );
        return {
          success: true,
          providerAcceptedMessageId: messageId,
          latencyMs,
        };
      }

      const errorCode = data?.error?.code;
      const errorMsg = data?.error?.message ?? "Unknown Meta API error";
      const errorType = data?.error?.type ?? "";

      this.logger.error(
        `${logPrefix}[FAILED] HTTP ${response.status} to=${maskedPhone} ` +
          `code=${errorCode ?? "n/a"} type=${errorType || "n/a"}`,
      );

      return this.classifyMetaError(errorCode, errorType, errorMsg, latencyMs, String(response.status));
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = e?.name === "AbortError";
      this.logger.error(
        `${logPrefix}[ERROR] ${isTimeout ? "Timeout" : "Network"} to=${maskedPhone} (+${latencyMs}ms)`,
      );
      return {
        success: false,
        errorCode: isTimeout ? "OTP_PROVIDER_TIMEOUT" : "OTP_NETWORK_ERROR",
        errorMessage: isTimeout
          ? "WhatsApp API request timed out"
          : "Unable to reach WhatsApp API",
        failureClass: "PROVIDER_TIMEOUT",
        latencyMs,
      };
    }
  }

  /** Public for unit tests — builds Meta template payload (must not be logged with code). */
  buildPayload(
    destinationE164: string,
    code: string,
    cfg?: ReturnType<WhatsAppOtpProvider["getConfig"]>,
  ) {
    const resolved = cfg ?? this.getConfig();
    const { templateName, templateLanguage, templateType } = resolved;
    const components: object[] = [];

    components.push({
      type: "body",
      parameters: [{ type: "text", text: code }],
    });

    switch (templateType) {
      case "AUTH_COPY_CODE":
        components.push({
          type: "button",
          sub_type: "COPY_CODE",
          index: "0",
          parameters: [{ type: "coupon_code", coupon_code: code }],
        });
        break;
      case "AUTH_ONE_TAP":
        components.push({
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }],
        });
        break;
      case "AUTH_GENERIC":
        break;
      case "AUTH_COPY_CODE_NOBD":
        components.length = 0;
        components.push({
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }],
        });
        break;
      case "AUTH_ZERO_PARAM":
        components.length = 0;
        break;
      case "AUTH_CC_NOBD":
        components.length = 0;
        components.push({
          type: "button",
          sub_type: "COPY_CODE",
          index: "0",
          parameters: [{ type: "coupon_code", coupon_code: code }],
        });
        break;
      case "AUTH_BODY_URL":
        components.push({
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }],
        });
        break;
      case "AUTH_COPY_CODE_EXPIRY":
        components.length = 0;
        components.push({
          type: "body",
          parameters: [
            { type: "text", text: code },
            { type: "text", text: resolved.expiryMinutes },
          ],
        });
        components.push({
          type: "button",
          sub_type: "COPY_CODE",
          index: "0",
          parameters: [{ type: "coupon_code", coupon_code: code }],
        });
        break;
    }

    return {
      messaging_product: "whatsapp",
      to: destinationE164.replace("+", ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components,
      },
    };
  }

  getConfig() {
    const rawTemplateType = (
      this.config.get<string>("OTP_WHATSAPP_TEMPLATE_TYPE") || ""
    )
      .trim()
      .toUpperCase();

    return {
      phoneNumberId: (this.config.get<string>("OTP_WHATSAPP_PHONE_NUMBER_ID") || "").trim(),
      accessToken: (this.config.get<string>("OTP_WHATSAPP_ACCESS_TOKEN") || "").trim(),
      templateName: (this.config.get<string>("OTP_WHATSAPP_TEMPLATE_NAME") || "").trim(),
      templateLanguage: (this.config.get<string>("OTP_WHATSAPP_TEMPLATE_LANGUAGE") || "").trim(),
      templateType: rawTemplateType as OtpTemplateType,
      timeoutMs: Number(this.config.get<string>("OTP_WHATSAPP_TIMEOUT_MS") || ""),
      apiVersion: (this.config.get<string>("OTP_WHATSAPP_API_VERSION") || "").trim(),
      expiryMinutes: (this.config.get<string>("OTP_WHATSAPP_EXPIRY_MINUTES") || "10").trim(),
    };
  }

  validateConfig(): { ok: boolean; reason?: string } {
    const modeRaw = (this.config.get<string>("OTP_WHATSAPP_MODE") || "").trim().toLowerCase();
    if (!modeRaw) {
      return { ok: false, reason: "OTP_WHATSAPP_MODE not configured" };
    }
    if (modeRaw !== "sandbox" && modeRaw !== "live") {
      return {
        ok: false,
        reason: `OTP_WHATSAPP_MODE must be sandbox|live when sending (got "${modeRaw}")`,
      };
    }

    const cfg = this.getConfig();
    if (!cfg.phoneNumberId) {
      return { ok: false, reason: "OTP_WHATSAPP_PHONE_NUMBER_ID not configured" };
    }
    if (!/^\d{5,30}$/.test(cfg.phoneNumberId)) {
      return { ok: false, reason: "OTP_WHATSAPP_PHONE_NUMBER_ID is invalid" };
    }
    if (!cfg.accessToken) {
      return { ok: false, reason: "OTP_WHATSAPP_ACCESS_TOKEN not configured" };
    }
    if (!cfg.templateName) {
      return { ok: false, reason: "OTP_WHATSAPP_TEMPLATE_NAME not configured" };
    }
    if (!cfg.templateLanguage) {
      return { ok: false, reason: "OTP_WHATSAPP_TEMPLATE_LANGUAGE not configured" };
    }
    if (!cfg.templateType) {
      return { ok: false, reason: "OTP_WHATSAPP_TEMPLATE_TYPE not configured" };
    }

    const validTypes: OtpTemplateType[] = [
      "AUTH_COPY_CODE",
      "AUTH_ONE_TAP",
      "AUTH_GENERIC",
      "AUTH_COPY_CODE_NOBD",
      "AUTH_CC_NOBD",
      "AUTH_BODY_URL",
      "AUTH_ZERO_PARAM",
      "AUTH_COPY_CODE_EXPIRY",
    ];
    if (!validTypes.includes(cfg.templateType)) {
      return {
        ok: false,
        reason: `OTP_WHATSAPP_TEMPLATE_TYPE is unknown: ${cfg.templateType}`,
      };
    }

    if (!cfg.apiVersion) {
      return { ok: false, reason: "OTP_WHATSAPP_API_VERSION not configured" };
    }
    if (!/^v\d+\.\d+$/.test(cfg.apiVersion)) {
      return {
        ok: false,
        reason: "OTP_WHATSAPP_API_VERSION must match v<number>.<number>",
      };
    }

    if (!Number.isFinite(cfg.timeoutMs) || cfg.timeoutMs < 1000 || cfg.timeoutMs > 60000) {
      return {
        ok: false,
        reason: "OTP_WHATSAPP_TIMEOUT_MS must be a finite number between 1000 and 60000",
      };
    }

    return { ok: true };
  }

  private classifyMetaError(
    errorCode: number | undefined,
    errorType: string,
    errorMessage: string,
    latencyMs: number,
    httpStatus: string,
  ): WhatsAppOtpSendResult {
    if (errorCode != null && String(errorCode).startsWith("132")) {
      return {
        success: false,
        errorCode: `META_${errorCode}`,
        errorMessage,
        failureClass: "TEMPLATE_ERROR",
        latencyMs,
      };
    }

    if (errorCode === 190 || errorCode === 10 || errorType === "OAuthException") {
      return {
        success: false,
        errorCode: "META_AUTH_ERROR",
        errorMessage,
        failureClass: "PROVIDER_REJECTED",
        latencyMs,
      };
    }

    return {
      success: false,
      errorCode: `META_${errorCode ?? "UNKNOWN"}`,
      errorMessage,
      failureClass: "DELIVERY_FAILED",
      latencyMs,
    };
  }

  private configError(reason: string): WhatsAppOtpSendResult {
    return {
      success: false,
      errorCode: "OTP_WHATSAPP_CONFIG_ERROR",
      errorMessage: reason,
      failureClass: "CONFIG_ERROR",
      latencyMs: 0,
    };
  }
}
