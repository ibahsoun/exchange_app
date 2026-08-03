import { Controller, Get, Post, Body, Param, Query, Inject, Patch, Delete, UseInterceptors, UploadedFile, BadRequestException, StreamableFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CustomersService } from './customers.service';
import type { CreateCustomerDto, UpdateCustomerDto } from './customers.service';

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

  @Post('upload-excel')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadExcel(@UploadedFile() file: Express.Multer.File & { buffer?: Buffer }) {
    const buffer = file?.buffer ?? (file as unknown as { buffer?: Buffer })?.buffer;
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new BadRequestException('No file uploaded. Use form field "file".');
    }
    return this.customersService.createManyFromExcel(buffer);
  }

  @Get('template')
  async getTemplate() {
    const buffer = await this.customersService.getExcelTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="customers-template.xlsx"',
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}
