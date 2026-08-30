import {
  Controller,
  Get,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CustomerEntryService } from './customer-entry.service';
import type { ViewerContext } from '../../store-integration/store-integration.types';
import { CUSTOMER_ENTRY_DISABLED_CODE } from './customer-entry.types';

type CacheableResponse = { setHeader: (name: string, value: string) => void };

/**
 * Customer Discovery entry endpoint.
 */
@Controller('marketplace')
export class CustomerEntryController {
  constructor(
    private readonly customerEntry: CustomerEntryService,
  ) {}

  @Get('customer-entry')
  async getCustomerEntry(
    @Res({ passthrough: true }) res: CacheableResponse,
  ) {
    if (!this.customerEntry.isEnabled()) {
      throw new ServiceUnavailableException({
        code: CUSTOMER_ENTRY_DISABLED_CODE,
        message: 'Store customer surface is not enabled.',
        retryable: false,
      });
    }

    const ctx: ViewerContext = {
      surface: 'web_store',
      isTrusted: false,
    };

    res.setHeader(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=300',
    );

    return this.customerEntry.build(ctx);
  }
}

