import type { LucideIcon } from "lucide-react";

type AboutFeatureCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function AboutFeatureCard({ icon: Icon, title, description }: AboutFeatureCardProps) {
  return (
    <article className="flex flex-col rounded-2xl border border-[#e7d8bf] bg-[#fff9ef] p-6 shadow-[0_12px_28px_rgba(42,62,46,0.1)] sm:p-7">
      <span
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#b9974a] text-[#fffaf1] shadow-[0_8px_16px_rgba(161,122,45,0.28)]"
        aria-hidden
      >
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h3 className="mt-5 font-heading text-lg font-semibold leading-snug text-primary sm:text-xl">{title}</h3>
      <p className="mt-2.5 text-sm leading-relaxed text-[#5f6c61] sm:text-[0.9375rem]">{description}</p>
    </article>
  );
}
