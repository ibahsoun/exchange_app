import { Controller, Get, Post, Body, Inject, BadRequestException } from '@nestjs/common';
import { MultiSourceService } from './multi-source.service';
import type { StoreRateMode } from './rates.constants';
import { validateSpread, type SpreadType, type SpreadMode, type FixedUnit } from './spread.util';

@Controller('rates')
export class MultiSourceController {
  constructor(@Inject(MultiSourceService) private multiSourceService: MultiSourceService) {}

  @Get('multi-source-board')
  getBoard() {
    return this.multiSourceService.getBoard();
  }

  @Post('multi-source-board/refresh')
  refreshBoard() {
    return this.multiSourceService.refreshBoard();
  }

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
      spreadType?: SpreadType;
      spreadMode?: SpreadMode;
      fixedUnit?: FixedUnit;
      spreadPercent?: number;
      spreadFixed?: number;
      buyMargin?: number;
      sellMargin?: number;
    },
  ) {
    return this.multiSourceService.updateStoreRate(body);
  }

  @Get('spreads')
  getAllSpreads() {
    return this.multiSourceService.getAllSpreads();
  }

  @Post('spread')
  async updateSpread(
    @Body()
    body: {
      base: string;
      quote: string;
      spreadType: SpreadType;
      spreadMode: SpreadMode;
      fixedUnit?: FixedUnit;
      spreadPercent?: number;
      spreadFixed?: number;
      buyMargin?: number;
      sellMargin?: number;
    },
  ) {
    const mid = await this.multiSourceService.getMidForPair(body.base, body.quote);
    const config = {
      spreadType: body.spreadType,
      spreadMode: body.spreadMode,
      fixedUnit: (body.fixedUnit ?? 'RAW') as FixedUnit,
      spreadPercent: body.spreadPercent ?? 0,
      spreadFixed: body.spreadFixed ?? 0,
      buyMargin: body.buyMargin ?? 0,
      sellMargin: body.sellMargin ?? 0,
    };
    const err = validateSpread(mid, config, body.quote);
    if (err) throw new BadRequestException(err);

    return this.multiSourceService.updateSpread(body);
  }
}
