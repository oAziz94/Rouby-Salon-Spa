import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentDepositPolicy, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { AuditService } from '../audit/audit.service';
import {
  assertValidSlotGeneration,
  mergeSlotGeneration,
  parseStoredSlotGeneration,
  pickOverridesFromSlotDto,
  type SlotGenerationDefaultsV1,
} from '../slots/slot-generation.utils';
import type { PatchSlotGenerationDto } from '../slots/dto/patch-slot-generation.dto';
import { SYSTEM_SETTINGS_ID } from './settings.constants';
import type { PatchBusinessIdentityDto } from './dto/patch-business-identity.dto';
import type { PatchDefaultBranchDto } from './dto/patch-default-branch.dto';
import type { PatchOperationsSettingsDto } from './dto/patch-operations-settings.dto';
import type { PatchPaymentPolicyDto } from './dto/patch-payment-policy.dto';
import type { PatchReceiptSettingsDto } from './dto/patch-receipt-settings.dto';
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
    private readonly audit: AuditService,
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
        salonName: 'Alrouby Salon & Spa',
        legalName: 'Alrouby Salon & Spa',
        phone: null,
        whatsappNumber: null,
        email: null,
        address: null,
        instagramHandle: null,
        facebookPage: null,
        defaultBranchId: null,
        vatEnabled: false,
        vatRatePercent: new Prisma.Decimal('14'),
        taxLabel: 'VAT',
        defaultVatRate: new Prisma.Decimal('0.14'),
        pricesIncludeVat: false,
        showVatOnInvoice: true,
        taxRegistrationNumber: null,
        receiptTitle: 'Receipt',
        receiptFooterMessage: 'Thank you for visiting Alrouby Salon & Spa',
        receiptWidth: '80mm',
        showSalonPhoneOnReceipt: true,
        showBranchAddressOnReceipt: true,
        showVatBreakdown: true,
        showPaymentBreakdown: true,
        showCashierName: true,
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
      vatRatePercent: this.decimalToNumber(row.vatRatePercent),
      taxLabel: row.taxLabel,
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
      dto.vatRatePercent !== undefined ||
      dto.taxLabel !== undefined ||
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
    if (dto.vatRatePercent !== undefined) {
      data.vatRatePercent = new Prisma.Decimal(dto.vatRatePercent.toString());
      data.defaultVatRate = new Prisma.Decimal(
        (dto.vatRatePercent / 100).toString(),
      );
    }
    if (dto.taxLabel !== undefined) data.taxLabel = dto.taxLabel;
    if (dto.defaultVatRate !== undefined) {
      data.defaultVatRate = new Prisma.Decimal(dto.defaultVatRate.toString());
      data.vatRatePercent = new Prisma.Decimal(
        (dto.defaultVatRate * 100).toString(),
      );
    }
    if (dto.pricesIncludeVat !== undefined)
      data.pricesIncludeVat = dto.pricesIncludeVat;
    if (dto.showVatOnInvoice !== undefined)
      data.showVatOnInvoice = dto.showVatOnInvoice;
    if (dto.taxRegistrationNumber !== undefined) {
      data.taxRegistrationNumber = dto.taxRegistrationNumber;
    }
    const before = await this.prisma.systemSettings.findUnique({
      where: { id: SYSTEM_SETTINGS_ID },
    });
    const updated = await this.prisma.systemSettings.update({
      where: { id: SYSTEM_SETTINGS_ID },
      data,
    });
    await this.audit.log({
      userId: user.userId,
      action: 'vat.settings.updated',
      module: 'settings',
      entityId: updated.id,
      oldValue: before
        ? {
            vatEnabled: before.vatEnabled,
            vatRatePercent: Number(before.vatRatePercent.toString()),
            taxLabel: before.taxLabel,
            defaultVatRate: Number(before.defaultVatRate.toString()),
            pricesIncludeVat: before.pricesIncludeVat,
            showVatOnInvoice: before.showVatOnInvoice,
            taxRegistrationNumber: before.taxRegistrationNumber,
          }
        : null,
      newValue: {
        vatEnabled: updated.vatEnabled,
        vatRatePercent: Number(updated.vatRatePercent.toString()),
        taxLabel: updated.taxLabel,
        defaultVatRate: Number(updated.defaultVatRate.toString()),
        pricesIncludeVat: updated.pricesIncludeVat,
        showVatOnInvoice: updated.showVatOnInvoice,
        taxRegistrationNumber: updated.taxRegistrationNumber,
      },
    });
    return this.getVatResponse();
  }

  async getSlotGenerationDefaultsResponse(): Promise<SlotGenerationDefaultsV1> {
    const row = await this.getRow();
    const merged = parseStoredSlotGeneration(row.slotGenerationDefaults);
    assertValidSlotGeneration(merged);
    return merged;
  }

  async patchSlotGenerationDefaults(
    user: DashboardJwtUser,
    dto: PatchSlotGenerationDto,
  ): Promise<SlotGenerationDefaultsV1> {
    const beforeRow = await this.prisma.systemSettings.findUnique({
      where: { id: SYSTEM_SETTINGS_ID },
      select: { slotGenerationDefaults: true },
    });
    const current = parseStoredSlotGeneration(
      beforeRow?.slotGenerationDefaults,
    );
    const merged = mergeSlotGeneration(current, pickOverridesFromSlotDto(dto));
    assertValidSlotGeneration(merged);
    const updated = await this.prisma.systemSettings.update({
      where: { id: SYSTEM_SETTINGS_ID },
      data: {
        slotGenerationDefaults: merged,
        updatedBy: { connect: { id: user.userId } },
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'slot_generation.defaults.updated',
      module: 'settings',
      entityId: updated.id,
      oldValue: beforeRow?.slotGenerationDefaults ?? null,
      newValue: merged,
    });
    return merged;
  }

  async patchPaymentPolicy(user: DashboardJwtUser, dto: PatchPaymentPolicyDto) {
    const before = await this.prisma.systemSettings.findUnique({
      where: { id: SYSTEM_SETTINGS_ID },
      select: { id: true, paymentDepositPolicy: true },
    });
    const updated = await this.prisma.systemSettings.update({
      where: { id: SYSTEM_SETTINGS_ID },
      data: {
        paymentDepositPolicy: dto.paymentDepositPolicy,
        updatedBy: { connect: { id: user.userId } },
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'payment.policy.updated',
      module: 'settings',
      entityId: updated.id,
      oldValue: { paymentDepositPolicy: before?.paymentDepositPolicy ?? null },
      newValue: { paymentDepositPolicy: updated.paymentDepositPolicy },
    });
    return this.getPaymentPolicyResponse();
  }

  async getDashboardSettings(user: DashboardJwtUser) {
    const row = await this.getRow();
    const canReadAllBranches = user.permissions.includes('branches.read');
    const branches = canReadAllBranches
      ? await this.prisma.branch.findMany({ orderBy: { name: 'asc' } })
      : [];
    return {
      businessIdentity: {
        salonName: row.salonName,
        legalName: row.legalName,
        phone: row.phone,
        whatsappNumber: row.whatsappNumber,
        email: row.email,
        address: row.address,
        instagramHandle: row.instagramHandle,
        facebookPage: row.facebookPage,
      },
      defaultBranchId: row.defaultBranchId,
      vatSettings: {
        vatEnabled: row.vatEnabled,
        vatRatePercent: this.decimalToNumber(row.vatRatePercent),
        taxLabel: row.taxLabel,
        showVatOnInvoice: row.showVatOnInvoice,
      },
      receiptSettings: {
        receiptTitle: row.receiptTitle,
        receiptFooterMessage: row.receiptFooterMessage,
        receiptWidth: row.receiptWidth,
        showSalonPhoneOnReceipt: row.showSalonPhoneOnReceipt,
        showBranchAddressOnReceipt: row.showBranchAddressOnReceipt,
        showVatBreakdown: row.showVatBreakdown,
        showPaymentBreakdown: row.showPaymentBreakdown,
        showCashierName: row.showCashierName,
      },
      operationsSettings: {
        dayCloseOpenItemsPolicy: row.dayCloseOpenItemsPolicy,
        discountLimitPercentWithoutApproval: this.decimalToNumber(
          row.discountLimitPercentWithoutApproval,
        ),
      },
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
        phone: b.phone,
        isActive: b.isActive,
      })),
    };
  }

  /** Front-desk rules the owner can tune: day-close policy and the reception discount cap. */
  async patchOperationsSettings(
    user: DashboardJwtUser,
    dto: PatchOperationsSettingsDto,
  ) {
    const before = await this.getRow();
    const updated = await this.prisma.systemSettings.update({
      where: { id: SYSTEM_SETTINGS_ID },
      data: {
        dayCloseOpenItemsPolicy: dto.dayCloseOpenItemsPolicy ?? undefined,
        discountLimitPercentWithoutApproval:
          dto.discountLimitPercentWithoutApproval === undefined
            ? undefined
            : new Prisma.Decimal(
                dto.discountLimitPercentWithoutApproval.toString(),
              ),
        updatedBy: { connect: { id: user.userId } },
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'settings.operations.updated',
      module: 'settings',
      entityId: updated.id,
      oldValue: {
        dayCloseOpenItemsPolicy: before.dayCloseOpenItemsPolicy,
        discountLimitPercentWithoutApproval: this.decimalToNumber(
          before.discountLimitPercentWithoutApproval,
        ),
      },
      newValue: {
        dayCloseOpenItemsPolicy: updated.dayCloseOpenItemsPolicy,
        discountLimitPercentWithoutApproval: this.decimalToNumber(
          updated.discountLimitPercentWithoutApproval,
        ),
      },
    });
    return this.getDashboardSettings(user);
  }

  async patchBusinessIdentity(
    user: DashboardJwtUser,
    dto: PatchBusinessIdentityDto,
  ) {
    const before = await this.getRow();
    const updated = await this.prisma.systemSettings.update({
      where: { id: SYSTEM_SETTINGS_ID },
      data: {
        salonName: dto.salonName?.trim() ?? undefined,
        legalName:
          dto.legalName === undefined
            ? undefined
            : dto.legalName?.trim() || null,
        phone: dto.phone === undefined ? undefined : dto.phone?.trim() || null,
        whatsappNumber:
          dto.whatsappNumber === undefined
            ? undefined
            : dto.whatsappNumber?.trim() || null,
        email:
          dto.email === undefined
            ? undefined
            : dto.email?.trim().toLowerCase() || null,
        address:
          dto.address === undefined ? undefined : dto.address?.trim() || null,
        instagramHandle:
          dto.instagramHandle === undefined
            ? undefined
            : dto.instagramHandle?.trim() || null,
        facebookPage:
          dto.facebookPage === undefined
            ? undefined
            : dto.facebookPage?.trim() || null,
        updatedBy: { connect: { id: user.userId } },
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'settings.business_identity.updated',
      module: 'settings',
      entityId: updated.id,
      oldValue: {
        salonName: before.salonName,
        legalName: before.legalName,
        phone: before.phone,
        whatsappNumber: before.whatsappNumber,
        email: before.email,
      },
      newValue: {
        salonName: updated.salonName,
        legalName: updated.legalName,
        phone: updated.phone,
        whatsappNumber: updated.whatsappNumber,
        email: updated.email,
      },
    });
    return this.getDashboardSettings(user);
  }

  async patchDefaultBranch(user: DashboardJwtUser, dto: PatchDefaultBranchDto) {
    if (dto.defaultBranchId) {
      await this.prisma.branch.findUniqueOrThrow({
        where: { id: dto.defaultBranchId },
      });
    }
    const before = await this.getRow();
    const updated = await this.prisma.systemSettings.update({
      where: { id: SYSTEM_SETTINGS_ID },
      data: {
        defaultBranch:
          dto.defaultBranchId === undefined
            ? undefined
            : dto.defaultBranchId === null
              ? { disconnect: true }
              : { connect: { id: dto.defaultBranchId } },
        updatedBy: { connect: { id: user.userId } },
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'settings.default_branch.updated',
      module: 'settings',
      entityId: updated.id,
      oldValue: { defaultBranchId: before.defaultBranchId },
      newValue: { defaultBranchId: updated.defaultBranchId },
    });
    return this.getDashboardSettings(user);
  }

  async patchReceiptSettings(
    user: DashboardJwtUser,
    dto: PatchReceiptSettingsDto,
  ) {
    const before = await this.getRow();
    const updated = await this.prisma.systemSettings.update({
      where: { id: SYSTEM_SETTINGS_ID },
      data: {
        receiptTitle: dto.receiptTitle?.trim() ?? undefined,
        receiptWidth: dto.receiptWidth ?? undefined,
        receiptFooterMessage:
          dto.receiptFooterMessage === undefined
            ? undefined
            : dto.receiptFooterMessage?.trim() || null,
        showSalonPhoneOnReceipt: dto.showSalonPhoneOnReceipt,
        showBranchAddressOnReceipt: dto.showBranchAddressOnReceipt,
        showVatBreakdown: dto.showVatBreakdown,
        showPaymentBreakdown: dto.showPaymentBreakdown,
        showCashierName: dto.showCashierName,
        updatedBy: { connect: { id: user.userId } },
      },
    });
    await this.audit.log({
      userId: user.userId,
      action: 'settings.receipt.updated',
      module: 'settings',
      entityId: updated.id,
      oldValue: {
        receiptTitle: before.receiptTitle,
        receiptWidth: before.receiptWidth,
        receiptFooterMessage: before.receiptFooterMessage,
      },
      newValue: {
        receiptTitle: updated.receiptTitle,
        receiptWidth: updated.receiptWidth,
        receiptFooterMessage: updated.receiptFooterMessage,
      },
    });
    return this.getDashboardSettings(user);
  }
}
