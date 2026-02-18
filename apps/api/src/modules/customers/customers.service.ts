import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CustomerFilters {
  search?: string;
  riskLevel?: string;
  expiryStatus?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async findAll(filters: CustomerFilters = {}) {
    const { search, riskLevel, expiryStatus, page = 1, limit = 25 } = filters;

    const where: Record<string, unknown> = {};

    if (riskLevel && riskLevel !== 'ALL') {
      where.riskLevel = riskLevel;
    }

    if (expiryStatus && expiryStatus !== 'ALL') {
      where.expiryStatus = expiryStatus;
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { customerId: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { nationality: { contains: search, mode: 'insensitive' } },
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
    const [total, pendingVerifications, highRisk] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { expiryStatus: 'EXPIRING' } }),
      this.prisma.customer.count({ where: { riskLevel: 'HIGH' } }),
    ]);
    return { total, pendingVerifications, highRisk };
  }

  async verifyIdentity(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        expiryStatus: 'VALID',
        riskLevel: customer.riskLevel === 'HIGH' ? 'MEDIUM' : customer.riskLevel,
      },
    });

    this.logger.log(`Customer ${customer.customerId} identity verified`);
    return updated;
  }

  async flagAccount(id: string, reason?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        riskLevel: 'HIGH',
        notes: reason
          ? `${customer.notes ? customer.notes + '\n' : ''}[FLAGGED] ${reason}`
          : customer.notes,
      },
    });

    this.logger.log(`Customer ${customer.customerId} flagged — risk set to HIGH`);
    return updated;
  }

  async updateNotes(id: string, notes: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.customer.update({
      where: { id },
      data: { notes },
    });
  }
}
