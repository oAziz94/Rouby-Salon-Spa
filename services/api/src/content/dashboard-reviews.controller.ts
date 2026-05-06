import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ContentService } from './content.service';
import { DashboardReviewsListQueryDto } from './dto/dashboard-reviews-list-query.dto';
import { PatchReviewDto } from './dto/review.dto';

@ApiTags('dashboard-content-reviews')
@Controller('dashboard/reviews')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardReviewsController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @RequirePermissions('reviews.read')
  @ApiOperation({ summary: 'List dashboard reviews/testimonials queue' })
  list(@Query() query: DashboardReviewsListQueryDto) {
    return this.content.listDashboardReviews(query);
  }

  @Patch(':id')
  @RequirePermissions('reviews.manage')
  @ApiOperation({ summary: 'Update review moderation and visibility' })
  patch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchReviewDto) {
    return this.content.patchReview(id, dto);
  }
}
