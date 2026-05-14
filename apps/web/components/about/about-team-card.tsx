import { AboutExpertPortrait } from "@/components/about/about-expert-portrait";

export type AboutTeamCardProps = {
  initial: string;
  name: string;
  title: string;
  specialization: string;
  imageUrl?: string | null;
};

export function AboutTeamCard({
  initial,
  name,
  title,
  specialization,
  imageUrl,
}: AboutTeamCardProps) {
  const portraitAlt = `Portrait of ${name}, ${title} at AlRouby Salon & Spa`;

  return (
    <article className="group flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e4d8c4] bg-[#fffdf8] shadow-[0_10px_26px_rgba(26,40,28,0.07)] transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(26,40,28,0.11)]">
      <div className="relative h-[168px] w-full shrink-0 overflow-hidden rounded-t-2xl border-b border-[#e8dfc8] bg-[#ebe2d2] sm:h-[200px] lg:h-[244px]">
        <AboutExpertPortrait src={imageUrl} alt={portraitAlt} initial={initial} />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#1f2420]/[0.12] to-transparent"
          aria-hidden
        />
        <div
          className="absolute bottom-0 left-1/2 z-[1] flex h-11 w-11 -translate-x-1/2 translate-y-[54%] items-center justify-center rounded-full border-[2.5px] border-[#fffdf8] bg-[#b9974a] font-heading text-[15px] font-semibold leading-none text-[#fffaf1] shadow-[0_10px_22px_rgba(26,40,32,0.18),0_4px_12px_rgba(185,151,74,0.38)] ring-1 ring-[#dcc9a5]/50"
          aria-hidden
        >
          {initial}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 pb-6 pt-10 text-center sm:px-6 sm:pt-11">
        <h3 className="font-heading text-[1.28rem] font-semibold leading-snug tracking-tight text-primary sm:text-[1.35rem]">
          {name}
        </h3>
        <p className="mt-2 text-[12px] font-medium leading-snug text-[#6d7a6f] sm:text-[13px]">
          {title}
        </p>
        <div
          className="mx-auto mt-5 h-px w-14 bg-gradient-to-r from-transparent via-[#c9a868]/70 to-transparent"
          aria-hidden
        />
        <p className="mt-4 flex-1 text-pretty text-center text-[13px] leading-relaxed text-[#5f6c61] sm:text-sm sm:leading-relaxed">
          {specialization}
        </p>
      </div>
    </article>
  );
}
