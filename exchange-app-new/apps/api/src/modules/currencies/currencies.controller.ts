import { Controller, Get, Post, Body, Param, Inject, Patch, Delete } from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import type { CreateCurrencyDto, UpdateCurrencyDto } from './currencies.service';

@Controller('currencies')
export class CurrenciesController {
  constructor(@Inject(CurrenciesService) private currenciesService: CurrenciesService) {}

  @Get()
  findAll() {
    return this.currenciesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateCurrencyDto) {
    return this.currenciesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCurrencyDto) {
    return this.currenciesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.currenciesService.remove(id);
  }

  @Post('reorder')
  reorder(@Body() body: { items: { id: string; sortIndex: number }[] }) {
    return this.currenciesService.reorder(body.items);
  }
}
