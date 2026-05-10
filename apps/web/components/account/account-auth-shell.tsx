import type { ReactNode } from "react";

type AccountAuthShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function AccountAuthShell({ title, subtitle, children }: AccountAuthShellProps) {
  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-[#faf7f0] pt-24 pb-16">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5c8 12 8 38 0 50M15 12c12 8 18 28 12 42M45 12c-12 8-18 28-12 42' fill='none' stroke='%2317351f' stroke-width='1'/%3E%3C/svg%3E")`,
        }}
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-lg px-4 sm:px-6">
        <div className="rounded-3xl border border-[#d8cdb9]/80 bg-gradient-to-b from-[#fffdf8] to-[#f3ebdd]/90 p-[1px] shadow-[0_24px_60px_rgba(23,53,31,0.08)]">
          <div className="rounded-[calc(1.5rem-1px)] bg-[#fdfaf4]/95 px-7 py-10 backdrop-blur-sm sm:px-10 sm:py-12">
            <p className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#6e775d]">
              Alrouby Salon &amp; Spa
            </p>
            <h1 className="mt-3 text-center font-heading text-3xl tracking-tight text-primary sm:text-4xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-muted sm:text-base">
                {subtitle}
              </p>
            ) : null}
            <div className="mt-8">{children}</div>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-muted">
          Secure access with a one-time code sent to your mobile. No password required.
        </p>
      </div>
    </div>
  );
}
