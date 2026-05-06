type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Loading..." }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-border bg-card px-5 py-6 text-sm text-muted"
    >
      <div className="mb-3 h-2 w-28 animate-pulse rounded bg-muted/35" />
      <div className="mb-2 h-2 w-full animate-pulse rounded bg-muted/25" />
      <div className="h-2 w-2/3 animate-pulse rounded bg-muted/20" />
      <p className="mt-4">{label}</p>
    </div>
  );
}
