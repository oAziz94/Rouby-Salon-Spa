"use client";

import { useMemo, useState } from "react";
import { buildWhatsAppUrl } from "@/lib/contact-display";

type ServiceOption = { id: string; name: string };

type ContactInquiryFormProps = {
  whatsappDigits: string;
  services: ServiceOption[];
};

export function ContactInquiryForm({ whatsappDigits, services }: ContactInquiryFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [message, setMessage] = useState("");

  const serviceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of services) {
      map.set(s.id, s.name);
    }
    return map;
  }, [services]);

  function composeMessage(): string {
    const lines: string[] = ["Hello Alrouby,", "", "I would like to get in touch:"];
    if (name.trim()) {
      lines.push(`Name: ${name.trim()}`);
    }
    if (email.trim()) {
      lines.push(`Email: ${email.trim()}`);
    }
    if (phone.trim()) {
      lines.push(`Phone: ${phone.trim()}`);
    }
    const svc = serviceId ? serviceNameById.get(serviceId) : "";
    if (svc) {
      lines.push(`Service interest: ${svc}`);
    }
    if (message.trim()) {
      lines.push("", "Message:", message.trim());
    }
    lines.push("", "Sent from the website contact form.");
    return lines.join("\n");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const url = buildWhatsAppUrl(whatsappDigits, composeMessage());
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-2xl border border-[#e8dfd0] bg-white p-6 shadow-[0_12px_40px_rgba(23,53,31,0.08)] sm:p-8"
    >
      <div>
        <h2 className="font-heading text-2xl font-semibold text-primary sm:text-[1.65rem]">
          Send Us a Message
        </h2>
        <p className="mt-1.5 text-sm text-[#5f6c61]">Let us know how we can help you.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-name" className="text-sm font-medium text-primary">
          Your Name
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Enter your name"
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          className="w-full rounded-xl border border-[#e0d5c4] bg-[#faf6ef] px-4 py-3 text-sm text-primary outline-none ring-primary/30 transition-shadow placeholder:text-[#9a8f82] focus:ring-2"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-email" className="text-sm font-medium text-primary">
          Email Address
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="your@email.com"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          className="w-full rounded-xl border border-[#e0d5c4] bg-[#faf6ef] px-4 py-3 text-sm text-primary outline-none ring-primary/30 transition-shadow placeholder:text-[#9a8f82] focus:ring-2"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-phone" className="text-sm font-medium text-primary">
          Phone Number
        </label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="e.g. 015 00000000"
          value={phone}
          onChange={(ev) => setPhone(ev.target.value)}
          className="w-full rounded-xl border border-[#e0d5c4] bg-[#faf6ef] px-4 py-3 text-sm text-primary outline-none ring-primary/30 transition-shadow placeholder:text-[#9a8f82] focus:ring-2"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-service" className="text-sm font-medium text-primary">
          Service Interest
        </label>
        <select
          id="contact-service"
          name="service"
          value={serviceId}
          onChange={(ev) => setServiceId(ev.target.value)}
          className="w-full rounded-xl border border-[#e0d5c4] bg-[#faf6ef] px-4 py-3 text-sm text-primary outline-none ring-primary/30 transition-shadow focus:ring-2"
        >
          <option value="">Select a service</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-message" className="text-sm font-medium text-primary">
          Your Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          placeholder="Tell us about your inquiry..."
          value={message}
          onChange={(ev) => setMessage(ev.target.value)}
          className="w-full resize-y rounded-xl border border-[#e0d5c4] bg-[#faf6ef] px-4 py-3 text-sm text-primary outline-none ring-primary/30 transition-shadow placeholder:text-[#9a8f82] focus:ring-2"
        />
      </div>

      <button
        type="submit"
        className="mt-1 w-full rounded-xl bg-[#c4a35a] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(196,163,90,0.35)] transition-opacity hover:opacity-90 active:opacity-[0.88]"
      >
        Send Message
      </button>

      <p className="text-center text-xs leading-relaxed text-[#7a6a58]">
        Sends your message in WhatsApp so our team can reply during business hours.
      </p>
    </form>
  );
}
