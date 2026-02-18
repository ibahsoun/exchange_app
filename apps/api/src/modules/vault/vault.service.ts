import { Inject, Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface VaultAdjustmentDto {
  currency: string;
  amount: number;
  notes?: string;
  user?: string;
}

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.vaultCurrency.findMany({
      include: { denominations: true },
      orderBy: { currency: 'asc' },
    });
  }

  async getAdjustments(limit = 20) {
    return this.prisma.vaultAdjustment.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getSummary() {
    const vaults: Awaited<ReturnType<typeof this.findAll>> = await this.findAll();
    const totalValue = vaults.reduce((sum: number, v) => sum + Number(v.totalAmount), 0);

    const criticalVaults = vaults.filter((v) => v.alertLevel === 'CRITICAL');
    const minorVaults = vaults.filter((v) => v.alertLevel === 'MINOR_ALERT');
    const alertCurrencies = [
      ...criticalVaults.map((v) => v.currency),
      ...minorVaults.map((v) => v.currency),
    ];

    let inventoryHealth: 'Optimal' | 'Warning' | 'Critical' = 'Optimal';
    if (criticalVaults.length > 2) inventoryHealth = 'Critical';
    else if (criticalVaults.length > 0 || minorVaults.length > 1) inventoryHealth = 'Warning';

    return {
      totalValue,
      valueChange: 0.42,
      criticalAlerts: criticalVaults.length,
      minorAlerts: minorVaults.length,
      alertCurrencies,
      inventoryHealth,
      totalCurrencies: vaults.length,
    };
  }

  async inbound(dto: VaultAdjustmentDto) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');

    const vault = await this.prisma.vaultCurrency.findUnique({
      where: { currency: dto.currency },
    });
    if (!vault) throw new BadRequestException(`Vault for ${dto.currency} not found`);

    // Update vault total
    const newTotal = Number(vault.totalAmount) + dto.amount;
    await this.prisma.vaultCurrency.update({
      where: { currency: dto.currency },
      data: { totalAmount: newTotal },
    });

    // Record adjustment
    const adjustment = await this.prisma.vaultAdjustment.create({
      data: {
        currency: dto.currency,
        amount: dto.amount,
        type: 'INBOUND',
        notes: dto.notes,
        user: dto.user ?? 'TELLER-04A',
        status: 'VERIFIED',
      },
    });

    // Recalculate alert level
    await this.recalculateAlertLevel(dto.currency);

    this.logger.log(`Inbound: +${dto.amount} ${dto.currency} (new total: ${newTotal})`);
    return adjustment;
  }

  async outbound(dto: VaultAdjustmentDto) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');

    const vault = await this.prisma.vaultCurrency.findUnique({
      where: { currency: dto.currency },
    });
    if (!vault) throw new BadRequestException(`Vault for ${dto.currency} not found`);

    const currentTotal = Number(vault.totalAmount);
    if (dto.amount > currentTotal)
      throw new BadRequestException(
        `Insufficient funds: ${dto.currency} has ${currentTotal}, requested ${dto.amount}`,
      );

    const newTotal = currentTotal - dto.amount;
    await this.prisma.vaultCurrency.update({
      where: { currency: dto.currency },
      data: { totalAmount: newTotal },
    });

    const adjustment = await this.prisma.vaultAdjustment.create({
      data: {
        currency: dto.currency,
        amount: -dto.amount,
        type: 'OUTBOUND',
        notes: dto.notes,
        user: dto.user ?? 'TELLER-04A',
        status: 'VERIFIED',
      },
    });

    await this.recalculateAlertLevel(dto.currency);

    this.logger.log(`Outbound: -${dto.amount} ${dto.currency} (new total: ${newTotal})`);
    return adjustment;
  }

  private async recalculateAlertLevel(currency: string) {
    const vault = await this.prisma.vaultCurrency.findUnique({
      where: { currency },
      include: { denominations: true },
    });
    if (!vault) return;

    const total = Number(vault.totalAmount);
    let alertLevel = 'HEALTHY';
    if (total < 50_000) alertLevel = 'CRITICAL';
    else if (total < 100_000) alertLevel = 'MINOR_ALERT';

    if (alertLevel !== vault.alertLevel) {
      await this.prisma.vaultCurrency.update({
        where: { currency },
        data: { alertLevel },
      });
    }
  }
}
