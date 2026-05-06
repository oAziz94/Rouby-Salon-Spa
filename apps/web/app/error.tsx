"use client";

import { ErrorState } from "@/components/states/error-state";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-12 sm:px-6 lg:px-10">
      <ErrorState
        title="Unable to load homepage"
        message={error.message || "Please try again."}
        onRetry={reset}
      />
    </div>
  );
}
