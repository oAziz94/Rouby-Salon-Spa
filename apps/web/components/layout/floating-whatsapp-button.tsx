const defaultMessage = "Hello, I need help with booking at Alrouby Salon & Spa.";

function buildWhatsAppLink(phone: string, message: string): string {
  const cleaned = phone.replace(/[^\d]/g, "");
  const params = new URLSearchParams({ text: message });
  return `https://wa.me/${cleaned}?${params.toString()}`;
}

export function FloatingWhatsAppButton() {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim();
  const message =
    process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT_MESSAGE?.trim() ?? defaultMessage;

  if (!phone) {
    return null;
  }

  return (
    <a
      href={buildWhatsAppLink(phone, message)}
      target="_blank"
      rel="noreferrer"
      aria-label="Contact us on WhatsApp"
      className="fixed bottom-5 right-5 z-50 inline-flex min-h-11 items-center rounded-full bg-[#25D366] px-5 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
    >
      WhatsApp
    </a>
  );
}
