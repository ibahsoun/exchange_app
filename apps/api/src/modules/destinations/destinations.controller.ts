import { Controller, Get, Post, Patch, Delete, Body, Param, Inject } from '@nestjs/common';
import { DestinationsService, type CreateDestinationDto, type UpdateDestinationDto } from './destinations.service';

@Controller('destinations')
export class DestinationsController {
  constructor(@Inject(DestinationsService) private service: DestinationsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateDestinationDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDestinationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
