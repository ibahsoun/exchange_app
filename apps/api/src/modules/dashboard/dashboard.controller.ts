import { Controller, Get, Inject } from '@nestjs/common';
import { RatesService } from '../rates/rates.service';

@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(RatesService) private ratesService: RatesService) {}

  @Get()
  async getOverview() {
    const rates = await this.ratesService.getLatestRates();
    const topRates = rates.slice(0, 6);
    return {
      liveRate: { base: 'USD', target: 'EUR', rate: 0.9245, spread: 0.25 },
      topRates,
    };
  }
}
