import { Controller, Get, Post, Body, Query, Inject, BadRequestException } from '@nestjs/common';
import { MultiSourceService } from './multi-source.service';
import type { StoreRateMode } from './rates.constants';
import { VALID_BASES } from './rates.constants';
import { validateSpread, type SpreadType, type SpreadMode, type FixedUnit } from './spread.util';

@Controller('rates')
export class MultiSourceController {
  constructor(@Inject(MultiSourceService) private multiSourceService: MultiSourceService) {}

  @Get('multi-source-board')
  getBoard(@Query('base') base?: string) {
    const baseCurrency = this.resolveBase(base);
    return this.multiSourceService.getBoard(baseCurrency);
  }

  @Post('multi-source-board/refresh')
  refreshBoard(@Query('base') base?: string) {
    const baseCurrency = this.resolveBase(base);
    return this.multiSourceService.refreshBoard(baseCurrency);
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
  getAllSpreads(@Query('base') base?: string) {
    const baseCurrency = this.resolveBase(base);
    return this.multiSourceService.getAllSpreads(baseCurrency);
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
      roundingDecimals?: number | null;
      roundingMode?: string | null;
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
    const err = validateSpread(mid, config);
    if (err) throw new BadRequestException(err);

    return this.multiSourceService.updateSpread(body);
  }

  @Get('level-points')
  getLevelPoints(@Query('base') base: string, @Query('quote') quote: string) {
    if (!base || !quote) {
      throw new BadRequestException('base and quote query params are required');
    }
    return this.multiSourceService.getLevelPoints(base, quote);
  }

  @Post('level-points')
  updateLevelPoints(
    @Body() body: { base: string; quote: string; pointsType?: string; fixedUnit?: string; levels: { level: number; points: number }[] },
  ) {
    if (!body.base || !body.quote || !body.levels) {
      throw new BadRequestException('base, quote, and levels are required');
    }
    return this.multiSourceService.updateLevelPoints(body);
  }

  private resolveBase(base?: string): string {
    if (!base || base === 'USD') return 'USD';
    if (!VALID_BASES.includes(base)) {
      throw new BadRequestException(`Invalid base currency "${base}". Valid options: ${VALID_BASES.join(', ')}`);
    }
    return base;
  }
}
