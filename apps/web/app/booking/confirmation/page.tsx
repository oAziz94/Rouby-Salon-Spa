import Link from "next/link";

type BookingConfirmationPageProps = {
  searchParams: Promise<{
    bookingId?: string;
  }>;
};

export default async function BookingConfirmationPage({
  searchParams,
}: BookingConfirmationPageProps) {
  const { bookingId } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-[920px] px-4 py-14 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-7">
        <p className="text-xs uppercase tracking-[0.14em] text-accent">
          Booking Request Received
        </p>
        <h1 className="mt-3 font-heading text-4xl text-primary">Pending Confirmation</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
          Your booking request has been received successfully. Our salon team will review
          and confirm your appointment via WhatsApp.
        </p>

        {bookingId ? (
          <div className="mt-5 rounded-lg border border-border bg-background p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">
              Booking Reference
            </p>
            <p className="mt-2 break-all text-sm font-medium text-foreground">{bookingId}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Back to Home
          </Link>
          <Link
            href="/booking"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Create Another Request
          </Link>
        </div>
      </section>
    </div>
  );
}
