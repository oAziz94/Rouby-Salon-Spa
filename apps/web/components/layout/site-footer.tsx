import Link from "next/link";

const footerLinks = [
  { href: "/services", label: "Services" },
  { href: "/packages", label: "Packages" },
  { href: "/bundles", label: "Bundles" },
  { href: "/gallery", label: "Gallery" },
  { href: "/testimonials", label: "Testimonials" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteFooter() {
  return (
    <footer className="bg-secondary text-secondary-foreground">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-14 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-3">
          <p className="font-heading text-2xl font-semibold">Alrouby Salon & Spa</p>
          <p className="max-w-2xl text-sm text-secondary-foreground/75">
            Premium botanical luxury experience. Browse services, choose your slot,
            and submit your booking request in minutes.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {footerLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-secondary-foreground/80 transition-colors hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="border-t border-secondary-foreground/15 pt-5 text-xs text-secondary-foreground/65">
          <p>All prices are displayed in EGP.</p>
        </div>
      </div>
    </footer>
  );
}
