-- CreateTable (if not exists — StoreRate may have been created via db push)
CREATE TABLE IF NOT EXISTS "StoreRate" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "mid" DECIMAL(18,8) NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'AUTO_AVG',
    "sourceHint" TEXT,
    "reason" TEXT,
    "updatedBy" TEXT,
    "spreadType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "spreadMode" TEXT NOT NULL DEFAULT 'SYMMETRIC',
    "spreadPercent" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "spreadFixed" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "buyMargin" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "sellMargin" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreRate_pkey" PRIMARY KEY ("id")
);

-- Add new columns to existing StoreRate table (safe: will silently fail if table was just created above)
ALTER TABLE "StoreRate" ADD COLUMN IF NOT EXISTS "spreadMode" TEXT NOT NULL DEFAULT 'SYMMETRIC';
ALTER TABLE "StoreRate" ADD COLUMN IF NOT EXISTS "spreadPercent" DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE "StoreRate" ADD COLUMN IF NOT EXISTS "spreadFixed" DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE "StoreRate" ADD COLUMN IF NOT EXISTS "buyMargin" DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE "StoreRate" ADD COLUMN IF NOT EXISTS "sellMargin" DECIMAL(18,8) NOT NULL DEFAULT 0;

-- Migrate existing spreadValue data to spreadPercent (backward compat)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StoreRate' AND column_name = 'spreadValue') THEN
    UPDATE "StoreRate" SET "spreadPercent" = "spreadValue" WHERE "spreadValue" > 0 AND "spreadPercent" = 0;
    ALTER TABLE "StoreRate" DROP COLUMN "spreadValue";
  END IF;
END $$;

-- Ensure unique constraint exists
CREATE UNIQUE INDEX IF NOT EXISTS "StoreRate_base_quote_key" ON "StoreRate"("base", "quote");
