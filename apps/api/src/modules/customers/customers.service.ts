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

export interface UpdateCustomerDto {
  name?: string;
  phone?: string;
  email?: string;
  level?: number;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async findAll(filters: CustomerFilters = {}) {
    const { search, page = 1, limit = 10000 } = filters;

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

  async update(id: string, dto: UpdateCustomerDto) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');

    const name = dto.name !== undefined ? dto.name.trim() : existing.name;
    if (!name) throw new BadRequestException('Customer name is required');

    return this.prisma.customer.update({
      where: { id },
      data: {
        name,
        phone: dto.phone !== undefined ? (dto.phone?.trim() || null) : existing.phone,
        email: dto.email !== undefined ? (dto.email?.trim() || null) : existing.email,
        level: dto.level !== undefined ? dto.level : existing.level,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');
    await this.prisma.customer.delete({ where: { id } });
    return { ok: true };
  }

  async createManyFromExcel(buffer: Buffer): Promise<{ created: number; errors: string[] }> {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('Excel file has no sheets');
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
    if (!rows.length) {
      throw new BadRequestException('Excel sheet is empty');
    }

    const headers = (rows[0] as unknown[]).map((h) => String(h ?? '').trim().toLowerCase());
    const nameIdx = headers.findIndex((h) => h === 'name' || h === 'full name' || h === 'customer name');
    const phoneIdx = headers.findIndex((h) => h === 'phone' || h === 'telephone' || h === 'mobile');
    const emailIdx = headers.findIndex((h) => h === 'email' || h === 'e-mail');
    const levelIdx = headers.findIndex((h) => h === 'level' || h === 'rating' || h === 'stars');

    if (nameIdx < 0) {
      throw new BadRequestException('Excel must have a "name" (or "full name") column');
    }

    const errors: string[] = [];
    let created = 0;
    const count = await this.prisma.customer.count();
    let nextNum = count + 1001;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const name = row[nameIdx] != null ? String(row[nameIdx]).trim() : '';
      if (!name) {
        errors.push(`Row ${i + 1}: name is empty`);
        continue;
      }
      const phone = phoneIdx >= 0 && row[phoneIdx] != null ? String(row[phoneIdx]).trim() || null : null;
      const email = emailIdx >= 0 && row[emailIdx] != null ? String(row[emailIdx]).trim() || null : null;
      let level = 3;
      if (levelIdx >= 0 && row[levelIdx] != null) {
        const v = Number(row[levelIdx]);
        level = Number.isFinite(v) && v >= 1 && v <= 5 ? Math.round(v) : 3;
      }

      try {
        const customerId = `CUST-${String(nextNum).padStart(4, '0')}`;
        await this.prisma.customer.create({
          data: { customerId, name, phone, email, level },
        });
        created++;
        nextNum++;
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : 'Failed to create'}`);
      }
    }

    return { created, errors };
  }

  async getExcelTemplate(): Promise<Buffer> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Phone', 'Email', 'Level'],
      ['John Doe', '+1 555 123 4567', 'john@example.com', 3],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
