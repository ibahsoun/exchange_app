import { Module } from '@nestjs/common';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';
import { RatesGateway } from './rates.gateway';
import { RatesScheduler } from './rates.scheduler';
import { MultiSourceController } from './multi-source.controller';
import { MultiSourceService } from './multi-source.service';
import {
  MockRateProvider,
  CurrencyFreaksProvider,
  XeProvider,
  TwelveDataProvider,
  OandaProvider,
} from './providers';
import { RATE_PROVIDER, MULTI_SOURCE_PROVIDERS } from './rates.constants';

@Module({
  controllers: [RatesController, MultiSourceController],
  providers: [
    RatesService,
    RatesGateway,
    RatesScheduler,
    MultiSourceService,
    {
      provide: RATE_PROVIDER,
      useFactory: () => {
        // Swap this factory to use a real provider in production
        return new MockRateProvider();
      },
    },
    {
      provide: MULTI_SOURCE_PROVIDERS,
      useFactory: () => [
        new CurrencyFreaksProvider(),
        new XeProvider(),
        new TwelveDataProvider(),
        new OandaProvider(),
      ],
    },
  ],
  exports: [RatesService, MultiSourceService],
})
export class RatesModule {}
