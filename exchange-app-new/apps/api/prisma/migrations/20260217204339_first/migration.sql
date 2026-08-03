-- CreateTable
CREATE TABLE "RateSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rate" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "bid" DECIMAL(18,8) NOT NULL,
    "ask" DECIMAL(18,8) NOT NULL,
    "mid" DECIMAL(18,8) NOT NULL,
    "spread" DECIMAL(18,8) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateSnapshot" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "bid" DECIMAL(18,8) NOT NULL,
    "ask" DECIMAL(18,8) NOT NULL,
    "mid" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualOverride" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "bid" DECIMAL(18,8) NOT NULL,
    "ask" DECIMAL(18,8) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "documentExpiry" TIMESTAMP(3) NOT NULL,
    "expiryStatus" TEXT NOT NULL DEFAULT 'VALID',
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "lifetimeVolume" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "preferredPair" TEXT,
    "activeSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avatarUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "amountIn" DECIMAL(18,2) NOT NULL,
    "amountOut" DECIMAL(18,2) NOT NULL,
    "rateApplied" DECIMAL(18,8) NOT NULL,
    "spread" DECIMAL(18,8) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tellerId" TEXT,
    "kycName" TEXT,
    "kycDocId" TEXT,
    "kycPurpose" TEXT,
    "kycSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultCurrency" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "currencyName" TEXT NOT NULL,
    "vaultName" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "alertLevel" TEXT NOT NULL DEFAULT 'HEALTHY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultCurrency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultDenomination" (
    "id" TEXT NOT NULL,
    "vaultCurrencyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'normal',

    CONSTRAINT "VaultDenomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultAdjustment" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" TEXT NOT NULL,
    "notes" TEXT,
    "user" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RateSource_name_key" ON "RateSource"("name");

-- CreateIndex
CREATE INDEX "Rate_base_quote_idx" ON "Rate"("base", "quote");

-- CreateIndex
CREATE INDEX "Rate_timestamp_idx" ON "Rate"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Rate_base_quote_sourceId_key" ON "Rate"("base", "quote", "sourceId");

-- CreateIndex
CREATE INDEX "RateSnapshot_base_quote_timestamp_idx" ON "RateSnapshot"("base", "quote", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ManualOverride_base_quote_key" ON "ManualOverride"("base", "quote");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerId_key" ON "Customer"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_receiptId_key" ON "Transaction"("receiptId");

-- CreateIndex
CREATE INDEX "Transaction_customerId_idx" ON "Transaction"("customerId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_base_quote_idx" ON "Transaction"("base", "quote");

-- CreateIndex
CREATE UNIQUE INDEX "VaultCurrency_currency_key" ON "VaultCurrency"("currency");

-- CreateIndex
CREATE INDEX "VaultDenomination_vaultCurrencyId_idx" ON "VaultDenomination"("vaultCurrencyId");

-- CreateIndex
CREATE INDEX "VaultAdjustment_currency_idx" ON "VaultAdjustment"("currency");

-- CreateIndex
CREATE INDEX "VaultAdjustment_createdAt_idx" ON "VaultAdjustment"("createdAt");

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RateSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultDenomination" ADD CONSTRAINT "VaultDenomination_vaultCurrencyId_fkey" FOREIGN KEY ("vaultCurrencyId") REFERENCES "VaultCurrency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
