import { Injectable, Inject, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';
import { MultiSourceService } from '../rates/multi-source.service';

export interface CreateTransactionDto {
  type: 'BUY' | 'SELL' | 'SWAP';
  base: string;
  quote: string;
  amountIn: number;
  customerId: string;
  destinationId?: string;
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
export class TransactionsService implements OnModuleInit {
  private readonly logger = new Logger(TransactionsService.name);
  private receiptCounter = 0;

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(RatesService) private ratesService: RatesService,
    @Inject(MultiSourceService) private multiSourceService: MultiSourceService,
  ) {}

  async onModuleInit() {
    const last = await this.prisma.transaction.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { receiptId: true },
    });
    if (last?.receiptId) {
      const num = parseInt(last.receiptId.replace('TX-', ''), 10);
      if (!isNaN(num)) {
        this.receiptCounter = num;
      }
    }
    this.logger.log(`Receipt counter initialized at ${this.receiptCounter}`);
  }

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

    // Fetch customer level points for relevant pairs
    const customerLevel = customer.level ?? 3;
    const noLp = { points: 0, pointsType: 'PERCENTAGE', fixedUnit: 'RAW' };
    const [baseLp, quoteLp] = await Promise.all([
      dto.base !== 'USD'
        ? this.multiSourceService.getLevelPointsForCustomer('USD', dto.base, customerLevel)
        : Promise.resolve(noLp),
      dto.quote !== 'USD'
        ? this.multiSourceService.getLevelPointsForCustomer('USD', dto.quote, customerLevel)
        : Promise.resolve(noLp),
    ]);

    // Helper: compute points offset for a given rate (reused for level points + destination)
    const pointsOffset = (mid: number, lp: { points: number; pointsType: string }) => {
      if (!lp.points || lp.points <= 0) return 0;
      if (lp.pointsType === 'FIXED') {
        return lp.points / 2;
      }
      return mid * (lp.points / 100) / 2;
    };

    // Fetch destination commission if provided
    const destination = dto.destinationId
      ? await this.prisma.destination.findUnique({ where: { id: dto.destinationId } })
      : null;

    // Destination commission — applied as flat fee on final amount, not as rate modifier
    const destFlatFee = (dest: { commission: unknown; commissionType: string } | null) => {
      if (!dest) return 0;
      const comm = Number(dest.commission);
      if (!comm || comm <= 0) return 0;
      if (dest.commissionType === 'FIXED') {
        return comm;
      }
      return 0; // percentage handled separately
    };
    const destPercentage = destination && destination.commissionType === 'PERCENTAGE' && Number(destination.commission) > 0
      ? Number(destination.commission) : 0;

    if (dto.base === 'USD' && quoteRate) {
      // USD → foreign: multiply by bid
      const lpOff = pointsOffset(quoteRate.mid, quoteLp);
      const adjustedBid = quoteRate.bid - lpOff;
      amountOut = dto.amountIn * adjustedBid;
      // Apply destination fee as flat amount or percentage on converted amount
      if (destPercentage > 0) {
        amountOut = amountOut * (1 - destPercentage / 100);
      } else {
        amountOut = amountOut - destFlatFee(destination);
      }
      effectiveRate = amountOut / dto.amountIn;
      spread = quoteRate.spread;
    } else if (dto.quote === 'USD' && baseRate) {
      // Foreign → USD: divide by ask
      const lpOff = pointsOffset(baseRate.mid, baseLp);
      const adjustedAsk = baseRate.ask + lpOff;
      amountOut = dto.amountIn / adjustedAsk;
      // Apply destination fee as flat amount or percentage on converted amount
      if (destPercentage > 0) {
        amountOut = amountOut * (1 - destPercentage / 100);
      } else {
        amountOut = amountOut - destFlatFee(destination);
      }
      effectiveRate = amountOut / dto.amountIn;
      spread = baseRate.spread;
    } else if (baseRate && quoteRate) {
      // Foreign → Foreign: go through USD
      const baseLpOff = pointsOffset(baseRate.mid, baseLp);
      const quoteLpOff = pointsOffset(quoteRate.mid, quoteLp);
      const adjustedBaseAsk = baseRate.ask + baseLpOff;
      const adjustedQuoteBid = quoteRate.bid - quoteLpOff;
      const usdAmount = dto.amountIn / adjustedBaseAsk;
      amountOut = usdAmount * adjustedQuoteBid;
      // Apply destination fee as flat amount or percentage on converted amount
      if (destPercentage > 0) {
        amountOut = amountOut * (1 - destPercentage / 100);
      } else {
        amountOut = amountOut - destFlatFee(destination);
      }
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
        destinationId: dto.destinationId || null,
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
