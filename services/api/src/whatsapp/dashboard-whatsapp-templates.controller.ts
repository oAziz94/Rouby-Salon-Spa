import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireAnyPermissions } from '../auth/decorators/require-any-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateWhatsappTemplateDto } from './dto/create-whatsapp-template.dto';
import { PatchWhatsappTemplateDto } from './dto/patch-whatsapp-template.dto';
import { WhatsappTemplatesService } from './whatsapp-templates.service';

@ApiTags('dashboard-whatsapp-templates')
@ApiBearerAuth('dashboard-jwt')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@Controller('dashboard/whatsapp-templates')
export class DashboardWhatsappTemplatesController {
  constructor(private readonly templates: WhatsappTemplatesService) {}

  @Get()
  @RequireAnyPermissions('whatsapp.templates.manage', 'whatsapp.send')
  @ApiOperation({ summary: 'List WhatsApp templates (full content)' })
  list() {
    return this.templates.list();
  }

  @Post()
  @RequirePermissions('whatsapp.templates.manage')
  @ApiOperation({ summary: 'Create WhatsApp template' })
  create(@Body() body: CreateWhatsappTemplateDto) {
    return this.templates.create({
      name: body.name,
      templateKey: body.templateKey,
      content: body.content,
      variables: body.variables,
      isActive: body.isActive,
    });
  }

  @Patch(':id')
  @RequirePermissions('whatsapp.templates.manage')
  @ApiOperation({
    summary:
      'Update WhatsApp template (name, content, variables, isActive only)',
  })
  patch(@Param('id') id: string, @Body() body: PatchWhatsappTemplateDto) {
    return this.templates.patch(id, {
      name: body.name,
      content: body.content,
      variables: body.variables,
      isActive: body.isActive,
    });
  }
}
