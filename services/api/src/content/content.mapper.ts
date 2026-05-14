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
  const name =
    review.clientName?.trim() || review.client?.fullName?.trim() || 'Client';
  return {
    clientName: name,
    clientTitle: review.clientTitle ?? null,
    rating: review.rating,
    quote: review.comment ?? '',
    serviceName: review.serviceName ?? null,
    displayOrder: review.displayOrder,
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
