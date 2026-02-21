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
    // Rates are stored as USD/<quote> (e.g. USD/EUR, USD/GBP)
    const rates = await this.ratesService.getLatestRates('USD');

    // Find the rate where USD is base and the currency is the quote
    const baseRate = dto.base === 'USD' ? null : rates.find((r) => r.base === 'USD' && r.quote === dto.base);
    const quoteRate = dto.quote === 'USD' ? null : rates.find((r) => r.base === 'USD' && r.quote === dto.quote);

    if (!baseRate && dto.base !== 'USD') {
      throw new BadRequestException(`No rate available for ${dto.base}`);
    }
    if (!quoteRate && dto.quote !== 'USD') {
      throw new BadRequestException(`No rate available for ${dto.quote}`);
    }

    // Calculate conversion
    // For USD/<currency> pairs: bid = how many units of <currency> per 1 USD
    // Converting base → USD: divide by the pair's ask (customer sells base, we buy)
    // Converting USD → quote: multiply by the pair's bid (customer buys quote, we sell)
    let amountOut: number;
    let effectiveRate: number;
    let spread: number;

    if (dto.base === 'USD' && quoteRate) {
      // USD → foreign: multiply by bid
      amountOut = dto.amountIn * quoteRate.bid;
      effectiveRate = quoteRate.bid;
      spread = quoteRate.spread;
    } else if (dto.quote === 'USD' && baseRate) {
      // Foreign → USD: divide by ask
      amountOut = dto.amountIn / baseRate.ask;
      effectiveRate = 1 / baseRate.ask;
      spread = baseRate.spread;
    } else if (baseRate && quoteRate) {
      // Foreign → Foreign: go through USD
      const usdAmount = dto.amountIn / baseRate.ask;
      amountOut = usdAmount * quoteRate.bid;
      effectiveRate = amountOut / dto.amountIn;
      spread = baseRate.spread + quoteRate.spread;
    } else {
      throw new BadRequestException(`Cannot calculate rate for ${dto.base}/${dto.quote}`);
    }

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
