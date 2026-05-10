type AboutPhilosophyCardProps = {
  title: string;
  description: string;
};

export function AboutPhilosophyCard({ title, description }: AboutPhilosophyCardProps) {
  return (
    <article className="rounded-2xl border border-[#e8dbc4] bg-white p-5 shadow-[0_10px_24px_rgba(42,62,46,0.08)] sm:p-6">
      <h3 className="font-heading text-lg font-semibold text-primary sm:text-xl">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#5f6c61] sm:text-[0.9375rem]">{description}</p>
    </article>
  );
}
