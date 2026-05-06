"use client";

import { useDashboardAuth } from "@/lib/dashboard-auth";
import { useEffect, useState } from "react";

export default function DashboardLoginPage() {
  const { login } = useDashboardAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  const expiredMessage =
    reason === "expired" || reason === "unauthorized"
      ? "Your session expired. Please sign in again."
      : null;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const queryReason = new URLSearchParams(window.location.search).get("reason");
    setReason(queryReason);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to sign in",
      );
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAF7F0] px-4">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[#1F2420]">Dashboard Login</h1>
        <p className="mt-1 text-sm text-[#7A6A58]">
          Sign in with your dashboard account.
        </p>

        {expiredMessage ? (
          <p
            className="mt-4 rounded-md border border-[#E6DCCB] bg-[#FFF9EE] px-3 py-2 text-sm text-[#7A6A58]"
            role="status"
            aria-live="polite"
          >
            {expiredMessage}
          </p>
        ) : null}
        {error ? (
          <p
            className="mt-4 rounded-md border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <label className="block" htmlFor="dashboard-login-email">
            <span className="text-sm font-medium text-[#1F2420]">Email</span>
            <input
              id="dashboard-login-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[#B9974A] focus:ring-2 focus:ring-[#B9974A]/30"
            />
          </label>
          <label className="block" htmlFor="dashboard-login-password">
            <span className="text-sm font-medium text-[#1F2420]">Password</span>
            <input
              id="dashboard-login-password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[#B9974A] focus:ring-2 focus:ring-[#B9974A]/30"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
