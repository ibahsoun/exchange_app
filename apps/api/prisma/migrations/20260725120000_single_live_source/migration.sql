-- Single live rate source.
--
-- The app previously compared several FX providers (currencyfreaks, xe,
-- twelvedata, oanda, mock). It now runs on one live feed — Beta Broadcaster,
-- registered as "betaserver" (LIVE_MARKET_SOURCE_KEY). This clears every trace
-- of the retired providers.

-- 1. Store rates pinned to a retired provider follow the live feed instead.
--    NULL hints (AUTO_AVG rows) are left alone.
UPDATE "StoreRate"
SET "sourceHint" = 'betaserver'
WHERE "sourceHint" IS NOT NULL AND "sourceHint" <> 'betaserver';

-- 2. Cached quotes collected from the retired providers.
DELETE FROM "RateTick" WHERE "source" <> 'betaserver';

-- 3. Latest-rate rows, then the provider registry entries they point at.
DELETE FROM "Rate"
WHERE "sourceId" IN (SELECT "id" FROM "RateSource" WHERE "name" <> 'betaserver');

DELETE FROM "RateSource" WHERE "name" <> 'betaserver';
