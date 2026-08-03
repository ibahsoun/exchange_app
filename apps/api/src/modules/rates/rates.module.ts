import { Module, Logger } from '@nestjs/common';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';
import { RatesGateway } from './rates.gateway';
import { RatesScheduler } from './rates.scheduler';
import { MultiSourceController } from './multi-source.controller';
import { MultiSourceService } from './multi-source.service';
import {
  MockRateProvider,
  MockMultiSourceProvider,
  LiveMarketClient,
  LiveMarketProvider,
  LiveMarketRateProvider,
} from './providers';
import { RATE_PROVIDER, MULTI_SOURCE_PROVIDERS, LIVE_MARKET_CLIENT, LIVE_FEED_QUOTES } from './rates.constants';

const logger = new Logger('RatesModule');

/**
 * Mock rates stand in for the feed during development only. In production an
 * unconfigured feed means no rates at all — inventing prices for a currency
 * exchange is worse than showing none.
 */
function useMockFallback(): boolean {
  return process.env.NODE_ENV !== 'production';
}

@Module({
  controllers: [RatesController, MultiSourceController],
  providers: [
    RatesService,
    RatesGateway,
    RatesScheduler,
    MultiSourceService,
    {
      // One shared client: the board and the ticker never double-fetch.
      provide: LIVE_MARKET_CLIENT,
      useFactory: () => {
        const client = new LiveMarketClient();
        if (client.isConfigured()) {
          logger.log(`Live rate source: ${client.label} (${client.name})`);
        } else if (useMockFallback()) {
          logger.warn(
            'LIVE_MARKET_* not configured — falling back to mock rates. ' +
              'Set LIVE_MARKET_BASE_URL to go live.',
          );
        } else {
          logger.error(
            'LIVE_MARKET_* not configured and NODE_ENV=production — rates will be ' +
              'unavailable. Mock rates are never served in production.',
          );
        }
        return client;
      },
    },
    {
      provide: RATE_PROVIDER,
      inject: [LIVE_MARKET_CLIENT],
      useFactory: (client: LiveMarketClient) =>
        client.isConfigured() || !useMockFallback()
          ? new LiveMarketRateProvider(client, LIVE_FEED_QUOTES)
          : new MockRateProvider(),
    },
    {
      provide: MULTI_SOURCE_PROVIDERS,
      inject: [LIVE_MARKET_CLIENT],
      useFactory: (client: LiveMarketClient) =>
        client.isConfigured() || !useMockFallback()
          ? [new LiveMarketProvider(client)]
          : [new MockMultiSourceProvider()],
    },
  ],
  exports: [RatesService, MultiSourceService],
})
export class RatesModule {}
