import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import {
  getPublicBranches,
  getPublicSiteContent,
  type PublicSiteContent,
} from "@/lib/api/public";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toWhatsAppLink(phone: string, text: string): string {
  const cleaned = phone.replace(/[^\d]/g, "");
  const params = new URLSearchParams({ text });
  return `https://wa.me/${cleaned}?${params.toString()}`;
}

function getContactSection(siteContent: PublicSiteContent | null) {
  const section = asRecord(siteContent?.contactSection);
  return {
    heading: readString(section.heading) ?? "Visit Us",
    subheading:
      readString(section.subheading) ??
      "Connect with our team and we will help you plan your next appointment.",
    phone: readString(section.phone),
    whatsapp: readString(section.whatsapp),
    address: readString(section.address),
    openingHours: readString(section.openingHours),
  };
}

export default async function ContactPage() {
  const [siteContentResult, branchesResult] = await Promise.allSettled([
    getPublicSiteContent(),
    getPublicBranches(),
  ]);

  const siteContent =
    siteContentResult.status === "fulfilled" ? siteContentResult.value : null;
  const contact = getContactSection(siteContent);

  if (siteContentResult.status === "rejected" && branchesResult.status === "rejected") {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 lg:px-10">
        <ErrorState message="Unable to load contact information right now." />
      </div>
    );
  }

  const branches = branchesResult.status === "fulfilled" ? branchesResult.value : [];

  const hasFallbackDetails =
    contact.address || contact.phone || contact.whatsapp || contact.openingHours;
  const hasBranchDetails = branches.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-14 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-7">
        <h1 className="font-heading text-4xl text-primary">{contact.heading}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          {contact.subheading}
        </p>
      </section>

      <section className="mt-8">
        {!hasFallbackDetails && !hasBranchDetails ? (
          <EmptyState
            title="Contact details unavailable"
            description="Contact information will appear here when published."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {hasBranchDetails
              ? branches.map((branch) => (
                  <article
                    key={branch.id}
                    className="rounded-xl border border-border bg-card p-5"
                  >
                    <h2 className="font-heading text-2xl text-primary">{branch.name}</h2>
                    <div className="mt-3 grid gap-2 text-sm text-muted">
                      {branch.address ? (
                        <p>
                          <span className="font-medium text-foreground">Address:</span>{" "}
                          {branch.address}
                        </p>
                      ) : null}
                      {branch.phone ? (
                        <p>
                          <span className="font-medium text-foreground">Phone:</span>{" "}
                          {branch.phone}
                        </p>
                      ) : null}
                      {typeof branch.workingHours === "string" ? (
                        <p>
                          <span className="font-medium text-foreground">
                            Opening hours:
                          </span>{" "}
                          {branch.workingHours}
                        </p>
                      ) : null}
                    </div>
                    {branch.whatsapp ? (
                      <a
                        href={toWhatsAppLink(
                          branch.whatsapp,
                          `Hello, I would like to ask about ${branch.name}.`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-5 inline-flex rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                      >
                        WhatsApp This Branch
                      </a>
                    ) : null}
                  </article>
                ))
              : null}

            {!hasBranchDetails && hasFallbackDetails ? (
              <article className="rounded-xl border border-border bg-card p-5">
                <h2 className="font-heading text-2xl text-primary">
                  Alrouby Salon & Spa
                </h2>
                <div className="mt-3 grid gap-2 text-sm text-muted">
                  {contact.address ? (
                    <p>
                      <span className="font-medium text-foreground">Address:</span>{" "}
                      {contact.address}
                    </p>
                  ) : null}
                  {contact.phone ? (
                    <p>
                      <span className="font-medium text-foreground">Phone:</span>{" "}
                      {contact.phone}
                    </p>
                  ) : null}
                  {contact.openingHours ? (
                    <p>
                      <span className="font-medium text-foreground">Opening hours:</span>{" "}
                      {contact.openingHours}
                    </p>
                  ) : null}
                </div>
                {contact.whatsapp ? (
                  <a
                    href={toWhatsAppLink(
                      contact.whatsapp,
                      "Hello, I would like to ask about Alrouby Salon & Spa.",
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    WhatsApp Us
                  </a>
                ) : null}
              </article>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
