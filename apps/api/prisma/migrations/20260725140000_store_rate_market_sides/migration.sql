-- Keep the feed's own two sides alongside the tracked mid.
--
-- Store bid/ask used to be derived from `mid` alone, so a pair with a zero
-- margin came back with bid = ask = mid even though the feed quotes two
-- distinct prices (USD/CNY 6.7714 / 6.7724). These columns hold the market
-- sides that produced `mid`, so the margin widens the real spread instead of
-- replacing it.
--
-- NULL means "no usable sides" — an operator-set/locked rate, or a source that
-- publishes a single price. Those still price both sides off the mid.

ALTER TABLE "StoreRate" ADD COLUMN "marketBid" DECIMAL(18,8);
ALTER TABLE "StoreRate" ADD COLUMN "marketAsk" DECIMAL(18,8);
