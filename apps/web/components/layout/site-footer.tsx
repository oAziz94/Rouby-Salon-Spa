import Link from "next/link";
import { FaFacebookF, FaInstagram, FaTiktok } from "react-icons/fa6";
import { BrandLogo } from "@/components/brand/brand-logo";
import type { PublicSiteContent } from "@/lib/api/public";
import { getPublicSiteContent } from "@/lib/api/public";
import { PUBLIC_SALON_PHONE } from "@/lib/contact-display";

const footerLinks = [
  { href: "/services", label: "Services" },
  { href: "/packages", label: "Packages" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getSocialLinks(siteContent: PublicSiteContent | null) {
  const social = asRecord(siteContent?.socialLinks);
  return {
    instagram: readString(social.instagram),
    facebook: readString(social.facebook),
    tiktok: readString(social.tiktok),
  };
}

const socialIconClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#40674d] text-[#f1d595] transition-colors hover:border-[#f1d595] hover:bg-[#1e4728] hover:text-[#fcefc6]";

export async function SiteFooter() {
  let siteContent: PublicSiteContent | null = null;
  try {
    siteContent = await getPublicSiteContent();
  } catch {
    siteContent = null;
  }

  const social = getSocialLinks(siteContent);

  const socialEntries = [
    { href: social.instagram, label: "Instagram", Icon: FaInstagram },
    { href: social.facebook, label: "Facebook", Icon: FaFacebookF },
    { href: social.tiktok, label: "TikTok", Icon: FaTiktok },
  ].filter((entry): entry is typeof entry & { href: string } => Boolean(entry.href));

  return (
    <footer className="bg-[#13311d] text-[#f7f1e6]">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-14 sm:px-6 lg:px-10">
        <div className="grid gap-8 border-b border-[#2b5338] pb-9 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <BrandLogo heightClass="h-11 sm:h-12" className="brightness-[1.06] contrast-[1.02]" />
              <p className="font-heading text-2xl font-semibold text-[#f7f1e6]">Alrouby</p>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#d5dbc8]">
              Premium botanical wellness with curated treatments in a calm, luxurious atmosphere.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#f1d595]">Quick Links</p>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              {footerLinks.map((item) => (
                <Link key={item.href} href={item.href} className="text-[#d5dbc8] transition-colors hover:text-[#f1d595]">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#f1d595]">Contact</p>
            <div className="mt-4 space-y-2 text-sm text-[#d5dbc8]">
              <p>
                <a href={PUBLIC_SALON_PHONE.telHref} className="transition-colors hover:text-[#f1d595]">
                  {PUBLIC_SALON_PHONE.display}
                </a>
              </p>
              <p>15 Radwan Ibn AlTabib Off Murad st., Giza</p>
              <p>Daily: 11:00 AM - 9:00 PM</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#f1d595]">Follow Us</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {socialEntries.length > 0 ? (
                socialEntries.map(({ href, label, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className={socialIconClass}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </a>
                ))
              ) : (
                <p className="text-sm text-[#b9c4ac]">Social links will appear here when configured.</p>
              )}
            </div>
          </div>
        </div>

        <div className="pt-5 text-xs text-[#b9c4ac]">
          <p>All prices are displayed in EGP.</p>
        </div>
      </div>
    </footer>
  );
}
