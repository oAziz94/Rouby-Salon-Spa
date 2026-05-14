import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContentService } from './content.service';

@ApiTags('public-content')
@Controller('public')
export class PublicContentController {
  constructor(private readonly content: ContentService) {}

  @Get('gallery')
  @ApiOperation({ summary: 'Public gallery (active items only)' })
  getGallery() {
    return this.content.getPublicGallery();
  }

  @Get('testimonials')
  @ApiOperation({
    summary:
      'Public homepage testimonial (active + selected for homepage; at most one)',
  })
  getTestimonials() {
    return this.content.getPublicTestimonials();
  }

  @Get('site-content')
  @ApiOperation({ summary: 'Public site content for homepage/contact/footer' })
  getSiteContent() {
    return this.content.getPublicSiteContent();
  }
}
