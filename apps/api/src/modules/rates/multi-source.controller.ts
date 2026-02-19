import { Controller, Get, Post, Body, Inject } from '@nestjs/common';
import { MultiSourceService } from './multi-source.service';
import type { StoreRateMode } from './rates.constants';

@Controller('rates')
export class MultiSourceController {
  constructor(@Inject(MultiSourceService) private multiSourceService: MultiSourceService) {}

  /** GET /api/rates/multi-source-board — full comparison board data */
  @Get('multi-source-board')
  getBoard() {
    return this.multiSourceService.getBoard();
  }

  /** POST /api/rates/multi-source-board/refresh — force refresh from all providers */
  @Post('multi-source-board/refresh')
  refreshBoard() {
    return this.multiSourceService.refreshBoard();
  }

  /** POST /api/rates/store-rate — update the store rate mode for a pair */
  @Post('store-rate')
  updateStoreRate(
    @Body()
    body: {
      base: string;
      quote: string;
      mode: StoreRateMode;
      mid?: number;
      sourceHint?: string;
      reason?: string;
      updatedBy?: string;
    },
  ) {
    return this.multiSourceService.updateStoreRate(body);
  }
}
