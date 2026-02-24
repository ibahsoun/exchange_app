import { Injectable, Inject, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateCurrencyDto {
  code: string;
  name: string;
  symbol: string;
  color?: string;
  sortIndex?: number;
}

export interface UpdateCurrencyDto {
  name?: string;
  symbol?: string;
  color?: string;
  sortIndex?: number;
}

@Injectable()
export class CurrenciesService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.currency.findMany({
      orderBy: { sortIndex: 'asc' },
    });
  }

  async create(dto: CreateCurrencyDto) {
    const existing = await this.prisma.currency.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Currency ${dto.code} already exists`);

    // Auto-assign sortIndex if not provided
    if (dto.sortIndex === undefined) {
      const last = await this.prisma.currency.findFirst({ orderBy: { sortIndex: 'desc' } });
      dto.sortIndex = last ? last.sortIndex + 1 : 0;
    }

    return this.prisma.currency.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        symbol: dto.symbol,
        color: dto.color ?? 'bg-gray-600',
        sortIndex: dto.sortIndex,
      },
    });
  }

  async update(id: string, dto: UpdateCurrencyDto) {
    const existing = await this.prisma.currency.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Currency not found`);

    return this.prisma.currency.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.currency.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Currency not found`);

    await this.prisma.currency.delete({ where: { id } });
    return { ok: true };
  }

  async reorder(items: { id: string; sortIndex: number }[]) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.currency.update({
          where: { id: item.id },
          data: { sortIndex: item.sortIndex },
        }),
      ),
    );
    return this.findAll();
  }
}
