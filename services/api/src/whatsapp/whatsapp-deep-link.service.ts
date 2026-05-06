import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatEgpAmount } from './format-egp';
import { substituteWhatsappTemplate } from './substitute-whatsapp-template';
import { buildWaMeUrl, normalizeWhatsappDigits } from './wa-me-link';

function httpBusiness(
  status: HttpStatus,
  message: string,
  code: string,
): HttpException {
  return new HttpException(
    {
      statusCode: status,
      message,
      error: status === HttpStatus.NOT_FOUND ? 'Not Found' : 'Bad Request',
      code,
    },
    status,
  );
}

@Injectable()
export class WhatsappDeepLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private canAccessAllBranches(user: DashboardJwtUser): boolean {
    return (
      user.branchId === null || user.permissions.includes('branches.manage')
    );
  }

  private assertDashboardBranchAccess(
    user: DashboardJwtUser,
    branchId: string,
  ): void {
    if (this.canAccessAllBranches(user)) {
      return;
    }
    if (user.branchId !== branchId) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  async generate(
    user: DashboardJwtUser,
    dto: { templateKey: string; bookingId: string; clientId?: string },
  ): Promise<{ url: string; displayText: string }> {
    const templateKey = dto.templateKey.trim();

    const template = await this.prisma.whatsAppTemplate.findUnique({
      where: { templateKey },
    });
    if (!template) {
      throw httpBusiness(
        HttpStatus.NOT_FOUND,
        'WhatsApp template not found',
        'WHATSAPP_TEMPLATE_NOT_FOUND',
      );
    }
    if (!template.isActive) {
      throw httpBusiness(
        HttpStatus.BAD_REQUEST,
        'This WhatsApp template is inactive',
        'WHATSAPP_TEMPLATE_INACTIVE',
      );
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: {
        branch: true,
        client: true,
        slot: true,
        items: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    this.assertDashboardBranchAccess(user, booking.branchId);

    if (dto.clientId !== undefined && dto.clientId !== booking.clientId) {
      throw httpBusiness(
        HttpStatus.BAD_REQUEST,
        'clientId does not match this booking',
        'BOOKING_CLIENT_MISMATCH',
      );
    }

    const branchWhatsapp = normalizeWhatsappDigits(
      booking.branch.whatsapp ?? '',
    );
    const envDefault = normalizeWhatsappDigits(
      this.config.get<string>('WHATSAPP_DEFAULT_NUMBER') ?? '',
    );
    const phoneDigits = branchWhatsapp.length > 0 ? branchWhatsapp : envDefault;
    if (phoneDigits.length < 8) {
      throw httpBusiness(
        HttpStatus.BAD_REQUEST,
        'No WhatsApp number is configured for this branch and WHATSAPP_DEFAULT_NUMBER is not set',
        'WHATSAPP_NUMBER_MISSING',
      );
    }

    const slot = booking.slot;
    const bookingDate = slot.date.toISOString().slice(0, 10);
    const bookingTime = `${slot.startTime.toISOString().slice(11, 19)}`;
    const services = booking.items
      .map((it) =>
        it.quantity > 1
          ? `${it.nameSnapshot} x${it.quantity}`
          : it.nameSnapshot,
      )
      .join(', ');

    const paidAgg = await this.prisma.payment.aggregate({
      where: { bookingId: booking.id, status: PaymentStatus.PAID },
      _sum: { amount: true },
    });
    const paidNum = Number(paidAgg._sum.amount?.toString() ?? '0');
    const totalNum = Number(booking.totalAmount.toString());
    const remainingNum = Math.max(0, totalNum - paidNum);

    const values: Record<string, string> = {
      clientName: booking.client.fullName,
      bookingDate,
      bookingTime,
      services,
      branchName: booking.branch.name,
      salonPhone: booking.branch.phone ?? '',
      salonAddress: booking.branch.address ?? '',
      totalAmount: formatEgpAmount(booking.totalAmount),
      paidAmount: formatEgpAmount(paidNum),
      remainingAmount: formatEgpAmount(remainingNum),
    };

    const displayText = substituteWhatsappTemplate(template.content, values);
    const url = buildWaMeUrl(phoneDigits, displayText);

    return { url, displayText };
  }
}
