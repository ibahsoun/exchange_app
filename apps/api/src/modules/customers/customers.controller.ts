import { Controller, Get, Post, Body, Param, Query, Inject } from '@nestjs/common';
import { CustomersService } from './customers.service';
import type { CreateCustomerDto } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(@Inject(CustomersService) private customersService: CustomersService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customersService.findAll({
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10000,
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

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }
}
