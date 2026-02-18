import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { RatesModule } from '../rates/rates.module';

@Module({
  imports: [RatesModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
