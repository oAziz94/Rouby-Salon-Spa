import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDashboardUser } from '../auth/decorators/current-dashboard-user.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { RequireAnyPermissions } from '../auth/decorators/require-any-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateWhatsappTemplateDto } from './dto/create-whatsapp-template.dto';
import { ListWhatsappTemplatesQueryDto } from './dto/list-whatsapp-templates-query.dto';
import { PatchWhatsappTemplateDto } from './dto/patch-whatsapp-template.dto';
import { PreviewWhatsappTemplateDto } from './dto/preview-whatsapp-template.dto';
import { WhatsappTemplatesService } from './whatsapp-templates.service';

@ApiTags('dashboard-whatsapp-templates')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/whatsapp-templates')
export class DashboardWhatsappTemplatesController {
  constructor(private readonly templates: WhatsappTemplatesService) {}

  @Get()
  @RequireAnyPermissions(
    'whatsapp.templates.read',
    'whatsapp.templates.manage',
    'whatsapp.send',
  )
  @ApiOperation({ summary: 'List WhatsApp templates (paginated, filtered)' })
  list(@Query() query: ListWhatsappTemplatesQueryDto) {
    return this.templates.list({
      search: query.search,
      category: query.category,
      language: query.language,
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @RequireAnyPermissions(
    'whatsapp.templates.read',
    'whatsapp.templates.manage',
    'whatsapp.send',
  )
  @ApiOperation({ summary: 'Get one WhatsApp template' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.getById(id);
  }

  @Post()
  @RequirePermissions('whatsapp.templates.manage')
  @ApiOperation({ summary: 'Create WhatsApp template' })
  create(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() body: CreateWhatsappTemplateDto,
  ) {
    return this.templates.create(
      {
        name: body.name,
        templateKey: body.templateKey,
        body: body.body,
        category: body.category,
        language: body.language,
        description: body.description,
        sampleData: body.sampleData,
        variables: body.variables,
        isActive: body.isActive,
        metaTemplateName: body.metaTemplateName,
        metaTemplateStatus: body.metaTemplateStatus,
        requiresMetaApproval: body.requiresMetaApproval,
      },
      user.userId,
    );
  }

  @Patch(':id')
  @RequirePermissions('whatsapp.templates.manage')
  @ApiOperation({ summary: 'Update WhatsApp template' })
  patch(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchWhatsappTemplateDto,
  ) {
    return this.templates.patch(id, { ...body }, user.userId);
  }

  @Post(':id/activate')
  @RequirePermissions('whatsapp.templates.manage')
  @ApiOperation({ summary: 'Activate WhatsApp template' })
  activate(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.activate(id, user.userId);
  }

  @Post(':id/deactivate')
  @RequirePermissions('whatsapp.templates.manage')
  @ApiOperation({ summary: 'Deactivate WhatsApp template' })
  deactivate(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.deactivate(id, user.userId);
  }

  @Post(':id/preview')
  @RequireAnyPermissions(
    'whatsapp.templates.read',
    'whatsapp.templates.manage',
    'whatsapp.send',
  )
  @ApiOperation({ summary: 'Render template preview (no WhatsApp send)' })
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PreviewWhatsappTemplateDto,
  ) {
    return this.templates.preview(id, body.sampleData);
  }
}
