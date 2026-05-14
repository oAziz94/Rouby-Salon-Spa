import { ContactFirstSection } from "@/components/contact/contact-first-section";
import {
  getPublicBranches,
  getPublicServices,
  getPublicSiteContent,
  type PublicBranch,
} from "@/lib/api/public";
import { mergePublicContactDisplay } from "@/lib/contact-display";
import { mergeContactIntro, mergeContactVisitBlock } from "@/lib/website-public-merge";

export default async function ContactPage() {
  const [siteContentResult, branchesResult, servicesResult] = await Promise.allSettled([
    getPublicSiteContent(),
    getPublicBranches(),
    getPublicServices({ pageSize: 120 }),
  ]);

  const siteContent =
    siteContentResult.status === "fulfilled" ? siteContentResult.value : null;
  const branches: PublicBranch[] =
    branchesResult.status === "fulfilled" ? branchesResult.value : [];

  const services =
    servicesResult.status === "fulfilled"
      ? servicesResult.value.data
          .slice()
          .sort((a, b) => {
            if (a.displayOrder !== b.displayOrder) {
              return a.displayOrder - b.displayOrder;
            }
            return a.name.localeCompare(b.name);
          })
          .map((s) => ({ id: s.id, name: s.name }))
      : [];

  const contact = mergePublicContactDisplay(siteContent, branches);
  const intro = mergeContactIntro(siteContent);
  const visit = mergeContactVisitBlock(siteContent);

  return (
    <div>
      <ContactFirstSection
        contact={contact}
        services={services}
        showIntro={intro.visible}
        introTitle={intro.title}
        introSubtitle={intro.subtitle}
        visitHeading={visit.visitHeading}
        whatsappHelpText={visit.whatsappHelpText}
        whatsappButtonLabel={visit.whatsappButtonLabel}
        defaultChatText={visit.defaultChatText}
      />
    </div>
  );
}
