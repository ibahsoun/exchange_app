import { Injectable, NotFoundException, BadRequestException, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CustomerFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateCustomerDto {
  name: string;
  phone?: string;
  email?: string;
  level?: number;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async findAll(filters: CustomerFilters = {}) {
    const { search, page = 1, limit = 25 } = filters;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { customerId: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async getStats() {
    const [total, avgResult] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.aggregate({ _avg: { level: true } }),
    ]);
    return { total, avgLevel: avgResult._avg.level ?? 3 };
  }

  async create(dto: CreateCustomerDto) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Customer name is required');
    }

    const count = await this.prisma.customer.count();
    const customerId = `CUST-${String(count + 1001).padStart(4, '0')}`;

    return this.prisma.customer.create({
      data: {
        customerId,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        level: dto.level ?? 3,
      },
    });
  }
}
