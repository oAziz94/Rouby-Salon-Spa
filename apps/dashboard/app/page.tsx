import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Alrouby Salon — dashboard
      </h1>
      <p className="mt-3 text-sm text-zinc-600 max-w-md text-center">
        Sprint 1: sign in below. Full staff UI comes in later sprints.
      </p>
      <Link
        href="/login"
        className="mt-6 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
      >
        Sign in
      </Link>
      <p className="mt-6 text-xs text-zinc-500">
        API base (optional):{" "}
        <code className="rounded bg-zinc-200 px-1.5 py-0.5">
          {process.env.NEXT_PUBLIC_API_URL ?? "not set"}
        </code>
      </p>
    </main>
  );
}
