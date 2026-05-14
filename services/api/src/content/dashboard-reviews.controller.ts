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
import { RequireAnyPermissions } from '../auth/decorators/require-any-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { DashboardJwtUser } from '../auth/dashboard-jwt-user';
import { DashboardJwtAuthGuard } from '../auth/guards/dashboard-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ContentService } from './content.service';
import { CreateDashboardReviewDto } from './dto/dashboard-review-create.dto';
import { PatchDashboardReviewHomepageDto } from './dto/dashboard-review-homepage.dto';
import { PatchDashboardReviewDto } from './dto/dashboard-review-patch.dto';
import { ReorderDashboardReviewsDto } from './dto/dashboard-reviews-reorder.dto';
import { DashboardReviewsListQueryDto } from './dto/dashboard-reviews-list-query.dto';

@ApiTags('dashboard-content-reviews')
@Controller('dashboard/reviews')
@UseGuards(DashboardJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('dashboard-jwt')
export class DashboardReviewsController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @RequirePermissions('reviews.read')
  @ApiOperation({ summary: 'List curated testimonials' })
  list(@Query() query: DashboardReviewsListQueryDto) {
    return this.content.listDashboardReviews(query);
  }

  @Get('stats')
  @RequirePermissions('reviews.read')
  @ApiOperation({ summary: 'Aggregate testimonial stats' })
  stats() {
    return this.content.getDashboardReviewsStats();
  }

  @Post()
  @RequireAnyPermissions('reviews.create', 'reviews.manage')
  @ApiOperation({ summary: 'Create testimonial (admin)' })
  create(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: CreateDashboardReviewDto,
  ) {
    return this.content.createDashboardReview(user, dto);
  }

  @Patch('reorder')
  @RequireAnyPermissions('reviews.update', 'reviews.manage')
  @ApiOperation({ summary: 'Update display order for multiple testimonials' })
  reorder(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Body() dto: ReorderDashboardReviewsDto,
  ) {
    return this.content.reorderDashboardReviews(user, dto);
  }

  @Get(':id')
  @RequirePermissions('reviews.read')
  @ApiOperation({ summary: 'Get testimonial detail' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.getDashboardReview(id);
  }

  @Patch(':id/homepage-visibility')
  @RequireAnyPermissions('reviews.homepage_select', 'reviews.manage')
  @ApiOperation({
    summary:
      'Set homepage testimonial (only one active selection; transaction enforces)',
  })
  patchHomepage(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchDashboardReviewHomepageDto,
  ) {
    return this.content.patchDashboardReviewHomepageVisibility(user, id, dto);
  }

  @Post(':id/activate')
  @RequireAnyPermissions('reviews.update', 'reviews.manage')
  @ApiOperation({ summary: 'Activate testimonial' })
  activate(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.content.activateDashboardReview(user, id);
  }

  @Post(':id/deactivate')
  @RequireAnyPermissions('reviews.deactivate', 'reviews.manage')
  @ApiOperation({ summary: 'Deactivate testimonial and remove from homepage' })
  deactivate(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.content.deactivateDashboardReview(user, id);
  }

  @Patch(':id')
  @RequireAnyPermissions('reviews.update', 'reviews.manage')
  @ApiOperation({ summary: 'Update testimonial' })
  patch(
    @CurrentDashboardUser() user: DashboardJwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchDashboardReviewDto,
  ) {
    return this.content.patchDashboardReview(user, id, dto);
  }
}
