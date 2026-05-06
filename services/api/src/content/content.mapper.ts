import type { GalleryItem, Review, SiteContent } from '@prisma/client';

export function toPublicGalleryItem(item: GalleryItem) {
  return {
    id: item.id,
    imageUrl: item.imageUrl,
    title: item.title,
    category: item.category,
    description: item.description,
    isFeatured: item.isFeatured,
    displayOrder: item.displayOrder,
  };
}

export function toPublicTestimonial(
  review: Review & { client: { fullName: string } | null },
) {
  return {
    id: review.id,
    clientName: review.client?.fullName ?? 'Anonymous',
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
  };
}

export function toPublicSiteContent(site: SiteContent) {
  return {
    homeHero: site.homeHero,
    aboutSection: site.aboutSection,
    contactSection: site.contactSection,
    footerSection: site.footerSection,
    socialLinks: site.socialLinks,
    seoDefaults: site.seoDefaults,
  };
}
