import { Module } from '@nestjs/common';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';
import { RatesGateway } from './rates.gateway';
import { RatesScheduler } from './rates.scheduler';
import { MockRateProvider } from './providers';
import { RATE_PROVIDER } from './rates.constants';

@Module({
  controllers: [RatesController],
  providers: [
    RatesService,
    RatesGateway,
    RatesScheduler,
    {
      provide: RATE_PROVIDER,
      useFactory: () => {
        // Swap this factory to use a real provider in production
        return new MockRateProvider();
      },
    },
  ],
  exports: [RatesService],
})
export class RatesModule {}
