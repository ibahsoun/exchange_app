import { Controller, Get, Post, Body, Inject } from '@nestjs/common';
import { VaultService } from './vault.service';
import type { VaultAdjustmentDto } from './vault.service';

@Controller('vault')
export class VaultController {
  constructor(@Inject(VaultService) private vaultService: VaultService) {}

  @Get()
  findAll() {
    return this.vaultService.findAll();
  }

  @Get('summary')
  getSummary() {
    return this.vaultService.getSummary();
  }

  @Get('adjustments')
  getAdjustments() {
    return this.vaultService.getAdjustments();
  }

  @Post('inbound')
  inbound(@Body() dto: VaultAdjustmentDto) {
    return this.vaultService.inbound(dto);
  }

  @Post('outbound')
  outbound(@Body() dto: VaultAdjustmentDto) {
    return this.vaultService.outbound(dto);
  }
}
