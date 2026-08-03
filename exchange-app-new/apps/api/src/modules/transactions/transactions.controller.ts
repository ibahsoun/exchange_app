import { Controller, Get, Post, Param, Query, Body, Inject } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import type { CreateTransactionDto } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(@Inject(TransactionsService) private txService: TransactionsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.txService.findAll({
      search,
      status,
      from,
      to,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 25,
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.txService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateTransactionDto) {
    return this.txService.create(dto);
  }
}
