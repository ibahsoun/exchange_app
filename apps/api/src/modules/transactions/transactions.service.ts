import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';

export interface CreateTransactionDto {
  type: 'BUY' | 'SELL' | 'SWAP';
  base: string;
  quote: string;
  amountIn: number;
  customerId: string;
}

export interface TransactionFilters {
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  private receiptCounter = 99282;

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(RatesService) private ratesService: RatesService,
  ) {}

  async findAll(filters: TransactionFilters = {}) {
    const { search, status, from, to, page = 1, limit = 25 } = filters;

    const where: Record<string, unknown> = {};

    // Status filter
    if (status && status !== 'ALL') {
      where.status = status;
    }

    // Date range filter
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to + 'T23:59:59Z') } : {}),
      };
    }

    // Search filter (receipt ID, customer name, or pair)
    if (search) {
      where.OR = [
        { receiptId: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { base: { contains: search, mode: 'insensitive' } },
        { quote: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { name: true, customerId: true },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    // Flatten customer data to match the shared Transaction type
    const mapped = items.map((tx: (typeof items)[number]) => {
      const fullName = tx.customer?.name ?? 'Unknown';
      const initials = fullName
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      return {
        ...tx,
        customerName: fullName,
        customerInitials: initials,
        amountIn: Number(tx.amountIn),
        amountOut: Number(tx.amountOut),
        rateApplied: Number(tx.rateApplied),
        spread: Number(tx.spread),
      };
    });

    return {
      items: mapped,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    return this.prisma.transaction.findUnique({
      where: { id },
      include: { customer: true },
    });
  }

  async create(dto: CreateTransactionDto) {
    // Validate customer exists
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    // Get live rate for the pair
    const rates = await this.ratesService.getLatestRates();
    const rate = rates.find((r) => r.base === dto.base && r.quote === 'USD');
    const quoteRate = rates.find((r) => r.base === dto.quote && r.quote === 'USD');

    if (!rate && dto.base !== 'USD') {
      throw new BadRequestException(`No rate available for ${dto.base}`);
    }
    if (!quoteRate && dto.quote !== 'USD') {
      throw new BadRequestException(`No rate available for ${dto.quote}`);
    }

    // Calculate conversion
    const baseBid = dto.base === 'USD' ? 1 : rate!.bid;
    const quoteAsk = dto.quote === 'USD' ? 1 : quoteRate!.ask;
    const usdAmount = dto.amountIn * baseBid;
    const amountOut = usdAmount / quoteAsk;
    const effectiveRate = amountOut / dto.amountIn;
    const spread = rate ? rate.spread : 0;

    const receiptId = `TX-${++this.receiptCounter}`;

    const transaction = await this.prisma.transaction.create({
      data: {
        receiptId,
        customerId: dto.customerId,
        type: dto.type,
        base: dto.base,
        quote: dto.quote,
        amountIn: dto.amountIn,
        amountOut: Number(amountOut.toFixed(2)),
        rateApplied: Number(effectiveRate.toFixed(8)),
        spread: Number(spread),
        status: 'COMPLETED',
        tellerId: 'TELLER-04A',
      },
      include: {
        customer: { select: { name: true, customerId: true } },
      },
    });

    this.logger.log(
      `Transaction ${receiptId} created: ${dto.base}/${dto.quote} ${dto.amountIn} → ${amountOut.toFixed(2)}`,
    );
    return transaction;
  }
}
