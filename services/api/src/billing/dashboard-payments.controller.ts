import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import { RequireAnyPermissions } from '../auth/decorators/require-any-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('dashboard-payments')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/payments')
export class DashboardPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

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
