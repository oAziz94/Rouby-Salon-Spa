type AboutTeamCardProps = {
  initial: string;
  name: string;
  title: string;
  specialization: string;
};

export function AboutTeamCard({ initial, name, title, specialization }: AboutTeamCardProps) {
  return (
    <article className="flex flex-col items-center rounded-2xl border border-[#e7d8bf] bg-white px-5 py-8 text-center shadow-[0_14px_30px_rgba(42,62,46,0.1)] sm:px-6 sm:py-9">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#dcc9a5] bg-[#b9974a] font-heading text-2xl font-semibold text-[#fffaf1] shadow-[0_10px_22px_rgba(161,122,45,0.35)]"
        aria-label={`${name} initial`}
      >
        {initial}
      </div>
      <h3 className="mt-5 font-heading text-xl font-semibold text-primary">{name}</h3>
      <p className="mt-1 text-sm font-medium text-[#5f6c61]">{title}</p>
      <p className="mt-2 text-xs uppercase tracking-[0.1em] text-[#a4782f]">{specialization}</p>
    </article>
  );
}
