import type { ReactNode } from "react";
import { Clock, MapPin, MessageCircle, Phone } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";
import type { MergedPublicContact } from "@/lib/contact-display";
import { buildWhatsAppUrl, PUBLIC_SALON_PHONE } from "@/lib/contact-display";
import { ContactInquiryForm } from "./contact-inquiry-form";

type ServiceOption = { id: string; name: string };

type ContactFirstSectionProps = {
  contact: MergedPublicContact;
  services: ServiceOption[];
  showIntro?: boolean;
  introTitle?: string;
  introSubtitle?: string;
  visitHeading?: string;
  whatsappHelpText?: string;
  whatsappButtonLabel?: string;
  defaultChatText?: string;
};

function iconTile(children: ReactNode) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f4e8d4] text-[#b9974a]">
      {children}
    </div>
  );
}

export function ContactFirstSection({
  contact,
  services,
  showIntro = true,
  introTitle = "Get In Touch",
  introSubtitle = "We'd love to hear from you. Visit us, call us, or send us a message to begin your wellness journey.",
  visitHeading = "Visit Us",
  whatsappHelpText = "Chat with us during business hours",
  whatsappButtonLabel = "Chat on WhatsApp",
  defaultChatText = "Hello, I would like to get in touch with Alrouby Wellness & Spa.",
}: ContactFirstSectionProps) {
  const chatHref = buildWhatsAppUrl(contact.whatsappDigits, defaultChatText);

  return (
    <section className="border-b border-[#e8dfd0] bg-[#f9f6f0] pb-14 pt-6 sm:pb-16 sm:pt-8 lg:pb-20">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
        {showIntro ? (
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-primary sm:text-5xl">
            {introTitle}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#5f6c61] sm:text-lg">
            {introSubtitle}
          </p>
        </header>
        ) : null}

        <div className={`mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start lg:gap-12 ${showIntro ? "" : "mt-0"}`}>
          <div>
            <h2 className="font-heading text-2xl font-semibold text-primary sm:text-[1.65rem]">
              {visitHeading}
            </h2>
            <ul className="mt-6 flex flex-col gap-4">
              <li className="flex gap-4 rounded-2xl border border-[#ebe3d6] bg-white/90 p-4 shadow-[0_8px_28px_rgba(23,53,31,0.06)]">
                {iconTile(<MapPin className="h-5 w-5" strokeWidth={1.75} aria-hidden />)}
                <div>
                  <p className="text-sm font-semibold text-primary">Location</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#5f6c61]">{contact.address}</p>
                </div>
              </li>
              <li className="flex gap-4 rounded-2xl border border-[#ebe3d6] bg-white/90 p-4 shadow-[0_8px_28px_rgba(23,53,31,0.06)]">
                {iconTile(<Clock className="h-5 w-5" strokeWidth={1.75} aria-hidden />)}
                <div>
                  <p className="text-sm font-semibold text-primary">Opening Hours</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[#5f6c61]">
                    {contact.openingHours}
                  </p>
                </div>
              </li>
              <li className="flex gap-4 rounded-2xl border border-[#ebe3d6] bg-white/90 p-4 shadow-[0_8px_28px_rgba(23,53,31,0.06)]">
                {iconTile(<Phone className="h-5 w-5" strokeWidth={1.75} aria-hidden />)}
                <div>
                  <p className="text-sm font-semibold text-primary">Phone</p>
                  <a
                    href={PUBLIC_SALON_PHONE.telHref}
                    className="mt-1 inline-block text-sm font-medium text-[#5f6c61] underline decoration-[#c4a35a]/50 underline-offset-2 transition-colors hover:text-primary"
                  >
                    {PUBLIC_SALON_PHONE.display}
                  </a>
                </div>
              </li>
              <li className="flex gap-4 rounded-2xl border border-[#ebe3d6] bg-white/90 p-4 shadow-[0_8px_28px_rgba(23,53,31,0.06)]">
                {iconTile(<MessageCircle className="h-5 w-5" strokeWidth={1.75} aria-hidden />)}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary">WhatsApp</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#5f6c61]">
                    {whatsappHelpText}
                  </p>
                  <a
                    href={chatHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(37,211,102,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.99]"
                  >
                    <FaWhatsapp className="h-5 w-5 shrink-0" aria-hidden />
                    {whatsappButtonLabel}
                  </a>
                </div>
              </li>
            </ul>
          </div>

          <ContactInquiryForm whatsappDigits={contact.whatsappDigits} services={services} />
        </div>
      </div>
    </section>
  );
}
