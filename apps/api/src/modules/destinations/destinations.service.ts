import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateDestinationDto {
  name: string;
  commission?: number;
  commissionType?: string;
  fixedUnit?: string;
}

export interface UpdateDestinationDto {
  name?: string;
  commission?: number;
  commissionType?: string;
  fixedUnit?: string;
}

@Injectable()
export class DestinationsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.destination.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    return this.prisma.destination.findUnique({ where: { id } });
  }

  async create(dto: CreateDestinationDto) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Destination name is required');
    }
    return this.prisma.destination.create({
      data: {
        name: dto.name.trim(),
        commission: dto.commission ?? 0,
        commissionType: dto.commissionType === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
        fixedUnit: 'RAW',
      },
    });
  }

  async update(id: string, dto: UpdateDestinationDto) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.commission !== undefined) data.commission = dto.commission;
    if (dto.commissionType !== undefined) data.commissionType = dto.commissionType === 'FIXED' ? 'FIXED' : 'PERCENTAGE';
    if (dto.fixedUnit !== undefined) data.fixedUnit = 'RAW';
    return this.prisma.destination.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.prisma.destination.delete({ where: { id } });
    return { ok: true };
  }
}
