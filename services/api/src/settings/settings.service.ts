import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentDepositPolicy, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { SYSTEM_SETTINGS_ID } from './settings.constants';
import type { PatchPaymentPolicyDto } from './dto/patch-payment-policy.dto';
import type { PatchVatSettingsDto } from './dto/patch-vat-settings.dto';

/**
 * Sprint 9: persist `AuditLog` on VAT / payment-policy mutations (SRS §22).
 * Sprint 2: no DB audit rows — domain mutations only.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private defaults(): { defaultTimezone: string; defaultCurrency: string } {
    return {
      defaultTimezone: this.config.get<string>(
        'DEFAULT_TIMEZONE',
        'Africa/Cairo',
      ),
      defaultCurrency: this.config.get<string>('DEFAULT_CURRENCY', 'EGP'),
    };
  }

  private decimalToNumber(d: Prisma.Decimal): number {
    return Number(d.toString());
  }

  async ensureSingletonRow(): Promise<void> {
    await this.prisma.systemSettings.upsert({
      where: { id: SYSTEM_SETTINGS_ID },
      create: {
        id: SYSTEM_SETTINGS_ID,
        vatEnabled: false,
        defaultVatRate: new Prisma.Decimal('0.14'),
        pricesIncludeVat: false,
        showVatOnInvoice: true,
        taxRegistrationNumber: null,
        paymentDepositPolicy: PaymentDepositPolicy.PAY_AT_SALON,
      },
      update: {},
    });
  }

  private async getRow() {
    await this.ensureSingletonRow();
    const row = await this.prisma.systemSettings.findUnique({
      where: { id: SYSTEM_SETTINGS_ID },
    });
    if (!row) {
      throw new NotFoundException('System settings not found');
    }
    return row;
  }

  async getVatResponse() {
    const row = await this.getRow();
    return {
      vatEnabled: row.vatEnabled,
      defaultVatRate: this.decimalToNumber(row.defaultVatRate),
      pricesIncludeVat: row.pricesIncludeVat,
      showVatOnInvoice: row.showVatOnInvoice,
      taxRegistrationNumber: row.taxRegistrationNumber,
      ...this.defaults(),
    };
  }

  async getPaymentPolicyResponse() {
    const row = await this.getRow();
    return {
      paymentDepositPolicy: row.paymentDepositPolicy,
      ...this.defaults(),
    };
  }

  getSystemReadResponse(): {
    defaultTimezone: string;
    defaultCurrency: string;
  } {
    return this.defaults();
  }

  /** Sprint 2: no mutable global fields; reserved for future sprints. */
  patchSystemNoOp(): { defaultTimezone: string; defaultCurrency: string } {
    return this.defaults();
  }

  async patchVat(user: DashboardJwtUser, dto: PatchVatSettingsDto) {
    const hasVatField =
      dto.vatEnabled !== undefined ||
      dto.defaultVatRate !== undefined ||
      dto.pricesIncludeVat !== undefined ||
      dto.showVatOnInvoice !== undefined ||
      dto.taxRegistrationNumber !== undefined;
    if (!hasVatField) {
      return this.getVatResponse();
    }
    const data: Prisma.SystemSettingsUpdateInput = {
      updatedBy: { connect: { id: user.userId } },
    };
    if (dto.vatEnabled !== undefined) data.vatEnabled = dto.vatEnabled;
    if (dto.defaultVatRate !== undefined) {
      data.defaultVatRate = new Prisma.Decimal(dto.defaultVatRate.toString());
    }
    if (dto.pricesIncludeVat !== undefined)
      data.pricesIncludeVat = dto.pricesIncludeVat;
    if (dto.showVatOnInvoice !== undefined)
      data.showVatOnInvoice = dto.showVatOnInvoice;
    if (dto.taxRegistrationNumber !== undefined) {
      data.taxRegistrationNumber = dto.taxRegistrationNumber;
    }
    await this.prisma.systemSettings.update({
      where: { id: SYSTEM_SETTINGS_ID },
      data,
    });
    return this.getVatResponse();
  }

  async patchPaymentPolicy(user: DashboardJwtUser, dto: PatchPaymentPolicyDto) {
    await this.prisma.systemSettings.update({
      where: { id: SYSTEM_SETTINGS_ID },
      data: {
        paymentDepositPolicy: dto.paymentDepositPolicy,
        updatedBy: { connect: { id: user.userId } },
      },
    });
    return this.getPaymentPolicyResponse();
  }
}
