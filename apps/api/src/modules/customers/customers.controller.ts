import { Controller, Get, Post, Param, Query, Body, Inject } from '@nestjs/common';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(@Inject(CustomersService) private customersService: CustomersService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('expiryStatus') expiryStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customersService.findAll({
      search,
      riskLevel,
      expiryStatus,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 25,
    });
  }

  @Get('stats')
  getStats() {
    return this.customersService.getStats();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  @Post(':id/verify')
  verifyIdentity(@Param('id') id: string) {
    return this.customersService.verifyIdentity(id);
  }

  @Post(':id/flag')
  flagAccount(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.customersService.flagAccount(id, body.reason);
  }
}
