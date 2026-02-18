import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RatesModule } from './modules/rates/rates.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { CustomersModule } from './modules/customers/customers.module';
import { VaultModule } from './modules/vault/vault.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    RatesModule,
    TransactionsModule,
    CustomersModule,
    VaultModule,
    DashboardModule,
  ],
})
export class AppModule {}
