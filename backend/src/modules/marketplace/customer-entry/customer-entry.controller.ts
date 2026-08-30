import {
  Controller,
  Get,
  Headers,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CustomerEntryService } from './customer-entry.service';
import { StoreIntegrationService } from '../../store-integration/store-integration.service';
import { resolveTrustedViewerContext } from '../../store-integration/surface-resolver';
import type { ViewerContext } from '../../store-integration/store-integration.types';
import { CUSTOMER_ENTRY_DISABLED_CODE } from './customer-entry.types';

type CacheableResponse = { setHeader: (name: string, value: string) => void };

/**
 * DilMart-CUSTOMER-STORE-STORE-PR2 — Customer Gateway entry endpoint.
 *
 * GET /marketplace/customer-entry — read-only curated Store discovery content for
 * the DilMart Customer App Gateway (master spec §7.4, §20). No sessions, no cart,
 * no orders, no checkout, no identity linking.
 *
 * Trusted surface comes ONLY from a verified `X-Store-Session` (the shared PR#71
 * resolver — no second source-to-surface resolver). No query parameter can promote
 * the caller: an unauthenticated request always resolves to the public `web_store`
 * surface, and `?surface=customer_app` is not accepted (no surface query param is
 * read at all).
 */
@Controller('marketplace')
export class CustomerEntryController {
  constructor(
    private readonly customerEntry: CustomerEntryService,
    private readonly storeIntegration: StoreIntegrationService,
  ) {}

  @Get('customer-entry')
  async getCustomerEntry(
    @Res({ passthrough: true }) res: CacheableResponse,
    @Headers('x-store-session') storeSession: string | undefined,
  ) {
    // Backend flag is authoritative; when disabled return the standard code.
    if (!this.customerEntry.isEnabled()) {
      throw new ServiceUnavailableException({
        code: CUSTOMER_ENTRY_DISABLED_CODE,
        message: 'Store customer surface is not enabled.',
        retryable: false,
      });
    }

    const ctx = this.resolveViewerContext(storeSession);

    // Short cache. Public only for the anonymous web_store surface; trusted
    // customer_app content is per-surface, so mark it private to avoid a shared
    // cache serving it to a different surface.
    if (ctx.surface === 'web_store') {
      res.setHeader(
        'Cache-Control',
        'public, max-age=60, stale-while-revalidate=300',
      );
    } else {
      res.setHeader('Cache-Control', 'private, max-age=30');
    }

    return this.customerEntry.build(ctx);
  }

  /**
   * Trusted context ONLY from a verified X-Store-Session, via the shared
   * `resolveTrustedViewerContext`. Anything else → public `web_store`.
   */
  private resolveViewerContext(
    storeSessionHeader: string | undefined,
  ): ViewerContext {
    if (storeSessionHeader) {
      const claims =
        this.storeIntegration.verifyStoreSessionHeader(storeSessionHeader);
      if (claims) {
        return resolveTrustedViewerContext(claims);
      }
    }
    return {
      surface: 'web_store',
      isTrusted: false,
      requiresVerifiedSalonCheck: false,
    };
  }
}
