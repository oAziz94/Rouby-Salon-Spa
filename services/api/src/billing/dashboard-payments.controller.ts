import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequireAnyPermissions } from '../auth/decorators/require-any-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { PaymentListQueryDto } from './dto/payment-list-query.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('dashboard-payments')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/payments')
export class DashboardPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions('payments.read')
  @ApiOperation({ summary: 'List payments (finance workspace)' })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: PaymentListQueryDto,
  ) {
    return this.payments.listDashboard(user, query);
  }

  @Get(':paymentId')
  @RequirePermissions('payments.read')
  @ApiOperation({
    summary: 'Get payment detail with invoice, client, and booking context',
  })
  getOne(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('paymentId') paymentId: string,
  ) {
    return this.payments.getDashboardDetail(user, paymentId);
  }

  @Patch(':paymentId')
  @RequireAnyPermissions('payments.record', 'payments.refund')
  @ApiOperation({ summary: 'Update a payment' })
  patch(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('paymentId') paymentId: string,
    @Body() body: UpdatePaymentDto,
  ) {
    return this.payments.updatePayment(user, paymentId, body);
  }
}
