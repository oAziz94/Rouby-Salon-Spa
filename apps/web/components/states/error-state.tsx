type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <section className="rounded-xl border border-destructive/25 bg-destructive/10 px-6 py-8">
      <h2 className="font-heading text-2xl text-destructive">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          Retry
        </button>
      ) : null}
    </section>
  );
}
