import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { CreateInvoicePaymentDto } from './dto/create-invoice-payment.dto';
import { InvoiceListQueryDto } from './dto/invoice-list-query.dto';
import { PatchInvoiceDto } from './dto/patch-invoice.dto';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';

@ApiTags('dashboard-invoices')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/invoices')
export class DashboardInvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  @RequirePermissions('invoices.read')
  @ApiOperation({ summary: 'List invoices' })
  list(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Query() query: InvoiceListQueryDto,
  ) {
    return this.invoices.listDashboard(user, query);
  }

  @Get(':invoiceId')
  @RequirePermissions('invoices.read')
  @ApiOperation({ summary: 'Get invoice by id' })
  getOne(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.invoices.getDashboardOne(user, invoiceId);
  }

  @Get(':invoiceId/receipt')
  @RequireAnyPermissions('invoices.print', 'invoices.read')
  @ApiOperation({ summary: 'Get finalized invoice receipt payload' })
  getReceipt(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.invoices.getDashboardReceipt(user, invoiceId);
  }

  @Patch(':invoiceId')
  @RequirePermissions('invoices.edit')
  @ApiOperation({ summary: 'Update invoice (restricted fields)' })
  patch(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('invoiceId') invoiceId: string,
    @Body() body: PatchInvoiceDto,
  ) {
    return this.invoices.patchDashboardInvoice(user, invoiceId, body);
  }

  @Post(':invoiceId/payments')
  @RequireAnyPermissions('payments.record')
  @ApiOperation({ summary: 'Record payment against a finalized invoice' })
  pay(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('invoiceId') invoiceId: string,
    @Body() body: CreateInvoicePaymentDto,
  ) {
    return this.payments.recordPaymentForInvoice(user, invoiceId, body);
  }
}
