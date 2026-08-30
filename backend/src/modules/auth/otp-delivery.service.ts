import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { maskPhoneForLogs, toWhatsAppE164 } from "./otp-phone.util";
import { WhatsAppOtpProvider } from "./whatsapp-otp.provider";

export interface OtpDeliveryInput {
  phone: string;
  code: string;
  purpose: "claim_account" | "password_reset" | "verify_phone";
  correlationId: string;
}

export interface OtpDeliveryProvider {
  sendOtp(input: OtpDeliveryInput): Promise<void>;
}

@Injectable()
export class OtpDeliveryService implements OtpDeliveryProvider {
  private readonly logger = new Logger(OtpDeliveryService.name);
  private sentOtpsForTesting: OtpDeliveryInput[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly whatsAppOtp: WhatsAppOtpProvider,
  ) {}

  private resolveProviderMode(): string {
    const raw = this.config.get<string>("OTP_PROVIDER");
    if (raw == null || String(raw).trim() === "") {
      return "disabled";
    }
    return String(raw).trim().toLowerCase();
  }

  private nodeEnv(): string {
    return (process.env.NODE_ENV || "development").toLowerCase();
  }

  /**
   * Account-independent readiness check.
   *
   * Anti-enumeration endpoints have to answer identically whether or not the account
   * exists, which previously meant swallowing every delivery error — including
   * "the channel is switched off". That made a misconfigured provider look exactly like
   * success and is why a missing WhatsApp message had no visible cause.
   *
   * Provider mode and channel configuration do not depend on the phone number, so
   * failing here is safe: it is true for every caller and leaks nothing. Per-send
   * failures stay swallowed by those endpoints, because those *are* account-dependent.
   */
  assertProviderReady(): void {
    const providerMode = this.resolveProviderMode();
    const nodeEnv = this.nodeEnv();

    if (providerMode === "disabled") {
      this.logger.error("[OTP] Readiness check failed — OTP_PROVIDER=disabled");
      throw new ServiceUnavailableException({
        code: "OTP_PROVIDER_DISABLED",
        message: "قناة إرسال رمز التحقق غير مفعّلة",
      });
    }

    if (providerMode === "fake" || providerMode === "test") {
      if (nodeEnv === "production") {
        this.logger.error(
          `[OTP] Readiness check failed — OTP_PROVIDER=${providerMode} is forbidden in production`,
        );
        throw new ServiceUnavailableException({
          code: "OTP_PROVIDER_FORBIDDEN_IN_PRODUCTION",
          message: "قناة إرسال رمز التحقق غير مهيأة بشكل صحيح",
        });
      }
      if (nodeEnv !== "test" && nodeEnv !== "development") {
        this.logger.error(
          `[OTP] Readiness check failed — OTP_PROVIDER=${providerMode} only allowed in test/development (NODE_ENV=${nodeEnv})`,
        );
        throw new ServiceUnavailableException({
          code: "OTP_PROVIDER_FORBIDDEN",
          message: "قناة إرسال رمز التحقق غير مهيأة بشكل صحيح",
        });
      }
      return;
    }

    if (providerMode !== "whatsapp") {
      this.logger.error(`[OTP] Readiness check failed — unsupported OTP_PROVIDER=${providerMode}`);
      throw new ServiceUnavailableException({
        code: "OTP_PROVIDER_UNSUPPORTED",
        message: "قناة إرسال رمز التحقق غير مهيأة بشكل صحيح",
      });
    }

    const validation = this.whatsAppOtp.validateConfig();
    if (!validation.ok) {
      // The reason names the offending variable, so it goes to logs only.
      this.logger.error(`[OTP] Readiness check failed — WhatsApp config: ${validation.reason}`);
      throw new ServiceUnavailableException({
        code: "OTP_WHATSAPP_CONFIG_ERROR",
        message: "قناة إرسال رمز التحقق غير مهيأة بشكل صحيح",
      });
    }
  }

  /**
   * Deliver OTP.
   * - OTP_PROVIDER missing/disabled → hard failure (never fake-success)
   * - fake|test → in-memory only; forbidden in production
   * - whatsapp → Meta Cloud API via WhatsAppOtpProvider
   * Never returns or logs the raw OTP code.
   */
  async sendOtp(input: OtpDeliveryInput): Promise<void> {
    const providerMode = this.resolveProviderMode();
    const masked = maskPhoneForLogs(input.phone);
    const nodeEnv = this.nodeEnv();

    if (providerMode === "disabled") {
      this.logger.error(
        `[OTP] OTP_PROVIDER=disabled — refusing silent success purpose=${input.purpose} correlationId=${input.correlationId}`,
      );
      throw new ServiceUnavailableException({
        code: "OTP_PROVIDER_DISABLED",
        message: "قناة إرسال رمز التحقق غير مفعّلة",
      });
    }

    if (providerMode === "fake" || providerMode === "test") {
      if (nodeEnv === "production") {
        this.logger.error(
          `[OTP] OTP_PROVIDER=${providerMode} is forbidden in production`,
        );
        throw new ServiceUnavailableException({
          code: "OTP_PROVIDER_FORBIDDEN_IN_PRODUCTION",
          message: "قناة إرسال رمز التحقق غير مهيأة بشكل صحيح",
        });
      }
      if (nodeEnv !== "test" && nodeEnv !== "development") {
        this.logger.error(
          `[OTP] OTP_PROVIDER=${providerMode} only allowed in test/development (NODE_ENV=${nodeEnv})`,
        );
        throw new ServiceUnavailableException({
          code: "OTP_PROVIDER_FORBIDDEN",
          message: "قناة إرسال رمز التحقق غير مهيأة بشكل صحيح",
        });
      }

      this.logger.log(
        `[OTP] Fake dispatch purpose=${input.purpose} correlationId=${input.correlationId} phone=${masked}`,
      );
      this.sentOtpsForTesting.push(input);
      return;
    }

    if (providerMode !== "whatsapp") {
      this.logger.error(`[OTP] Unsupported OTP_PROVIDER=${providerMode}`);
      throw new ServiceUnavailableException({
        code: "OTP_PROVIDER_UNSUPPORTED",
        message: "قناة إرسال رمز التحقق غير مهيأة بشكل صحيح",
      });
    }

    let destinationE164: string;
    try {
      destinationE164 = toWhatsAppE164(input.phone);
    } catch {
      this.logger.error(`[OTP] Invalid phone for WhatsApp delivery phone=${masked}`);
      throw new ServiceUnavailableException({
        code: "OTP_PHONE_INVALID",
        message: "تعذر إرسال رمز التحقق إلى هذا الرقم",
      });
    }

    const result = await this.whatsAppOtp.sendOtp(destinationE164, input.code);

    if (!result.success) {
      this.logger.error(
        `[OTP] WhatsApp submission failed purpose=${input.purpose} ` +
          `correlationId=${input.correlationId} phone=${masked} ` +
          `errorCode=${result.errorCode ?? "unknown"} class=${result.failureClass ?? "n/a"}`,
      );
      throw new ServiceUnavailableException({
        code: result.errorCode || "OTP_DELIVERY_FAILED",
        message: "تعذر إرسال رمز التحقق عبر واتساب. حاول مرة أخرى لاحقاً",
      });
    }

    this.logger.log(
      `[OTP] WhatsApp accepted purpose=${input.purpose} ` +
        `correlationId=${input.correlationId} phone=${masked} ` +
        `providerAcceptedMessageId=${result.providerAcceptedMessageId ?? "n/a"}`,
    );
  }

  /** Testing helper — memory only (fake mode). */
  getSentOtpsForTest(): OtpDeliveryInput[] {
    return [...this.sentOtpsForTesting];
  }

  clearSentOtpsForTest(): void {
    this.sentOtpsForTesting = [];
  }
}
