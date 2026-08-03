import { Injectable, Inject, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';
import { MultiSourceService } from '../rates/multi-source.service';
import { FEE_POINT_VALUE } from '../rates/rates.constants';
import { snapToStep } from '../rates/spread.util';

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
    // A non-positive or non-numeric amount would persist a corrupt COMPLETED
    // record (NaN rateApplied for 0, negative payouts for < 0).
    if (!Number.isFinite(dto.amountIn) || dto.amountIn <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

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
    // Single-rate model: each USD/<currency> pair has one rate (the mid).
    // The % moves the rate against the customer; the customer's points are
    // their spread (1pt = 0.01) and the pair spread is a discount for
    // everyone — both come back toward (or past) the market.
    // Example: rate 5.17, fee 1%, 2pt → customer pays 5.17 + 0.0517 − 0.02
    // = 5.2017 per USD, and receives 5.1383 in the other direction.
    let amountOut: number;
    let effectiveRate: number;

    // The customer's fee for this pair. Points are values in the fee's stored
    // orientation, so each branch applies them on whichever side the fee was
    // configured for.
    const fee = await this.multiSourceService.getCustomerPairFee(customer.id, dto.base, dto.quote);
    const feeOffset = (mid: number) =>
      fee ? (mid * fee.percent) / 100 - fee.points * FEE_POINT_VALUE : 0;

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
      // USD → foreign: customer receives the quote; the pair spread is a
      // discount, so it raises what they get
      const marketAdj = quoteRate.mid + quoteRate.spread;
      if (fee && fee.base === dto.quote) {
        // Fee stored on the inverted pair — apply it on that side.
        amountOut = dto.amountIn / (1 / marketAdj + feeOffset(1 / quoteRate.mid));
      } else {
        amountOut = dto.amountIn * (marketAdj - feeOffset(quoteRate.mid));
      }
      // Apply destination fee as flat amount or percentage on converted amount
      if (destPercentage > 0) {
        amountOut = amountOut * (1 - destPercentage / 100);
      } else {
        amountOut = amountOut - destFlatFee(destination);
      }
      effectiveRate = amountOut / dto.amountIn;
    } else if (dto.quote === 'USD' && baseRate) {
      // Foreign → USD: customer pays the base leg; the pair spread is a
      // discount, so it lowers what they pay
      const marketAdj = baseRate.mid - baseRate.spread;
      if (fee && fee.base === dto.base) {
        // Fee stored on the flipped pair — apply it on that side.
        amountOut = dto.amountIn * (1 / marketAdj - feeOffset(1 / baseRate.mid));
      } else {
        amountOut = dto.amountIn / (marketAdj + feeOffset(baseRate.mid));
      }
      // Apply destination fee as flat amount or percentage on converted amount
      if (destPercentage > 0) {
        amountOut = amountOut * (1 - destPercentage / 100);
      } else {
        amountOut = amountOut - destFlatFee(destination);
      }
      effectiveRate = amountOut / dto.amountIn;
    } else if (baseRate && quoteRate) {
      // Foreign → Foreign: go through USD; each leg's spread is a discount to
      // the customer (they pay the base leg, receive the quote leg)
      const crossAdj = (quoteRate.mid + quoteRate.spread) / (baseRate.mid - baseRate.spread);
      const crossMid = quoteRate.mid / baseRate.mid;
      if (fee && fee.base === dto.quote) {
        // Fee stored on the inverted pair — apply it on that side.
        amountOut = dto.amountIn / (1 / crossAdj + feeOffset(1 / crossMid));
      } else {
        amountOut = dto.amountIn * (crossAdj - feeOffset(crossMid));
      }
      // Apply destination fee as flat amount or percentage on converted amount
      if (destPercentage > 0) {
        amountOut = amountOut * (1 - destPercentage / 100);
      } else {
        amountOut = amountOut - destFlatFee(destination);
      }
      effectiveRate = amountOut / dto.amountIn;
    } else {
      throw new BadRequestException(`Cannot calculate rate for ${dto.base}/${dto.quote}`);
    }

    const receiptId = `TX-${++this.receiptCounter}`;

    // Persist what the teller actually pays out: the dashboard FLOORs the
    // receive amount at the pair's configured rounding, so the ledger must
    // match it. Without a configured rounding, keep 2dp nearest.
    const roundingRow =
      dto.quote === 'USD'
        ? null
        : await this.prisma.storeRate.findUnique({
            where: { base_quote: { base: 'USD', quote: dto.quote } },
            select: { roundingDecimals: true },
          });
    const outDecimals = roundingRow?.roundingDecimals ?? null;
    const persistedOut =
      outDecimals != null
        ? Math.floor(snapToStep(amountOut * Math.pow(10, outDecimals))) / Math.pow(10, outDecimals)
        : Number(amountOut.toFixed(2));

    const transaction = await this.prisma.transaction.create({
      data: {
        receiptId,
        customerId: dto.customerId,
        destinationId: dto.destinationId || null,
        type: dto.type,
        base: dto.base,
        quote: dto.quote,
        amountIn: dto.amountIn,
        amountOut: persistedOut,
        rateApplied: Number(effectiveRate.toFixed(8)),
        spread: Number((baseRate?.spread ?? 0) + (quoteRate?.spread ?? 0)),
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
