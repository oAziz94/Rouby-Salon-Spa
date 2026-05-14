"use client";

import { useDashboardAuth } from "@/lib/dashboard-auth";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useState } from "react";

const REMEMBER_DRAFTS_KEY = "dashboard_login_remember_drafts";
const REMEMBER_EMAIL_KEY = "dashboard_login_email";
const REMEMBER_PASSWORD_KEY = "dashboard_login_password";

export default function DashboardLoginPage() {
  const { login } = useDashboardAuth();
  const rememberId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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

    const shouldRestoreDrafts =
      window.localStorage.getItem(REMEMBER_DRAFTS_KEY) === "1";
    if (shouldRestoreDrafts) {
      setRememberMe(true);
      setEmail(window.localStorage.getItem(REMEMBER_EMAIL_KEY) ?? "");
      setPassword(window.localStorage.getItem(REMEMBER_PASSWORD_KEY) ?? "");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!rememberMe) {
      window.localStorage.removeItem(REMEMBER_DRAFTS_KEY);
      window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
      window.localStorage.removeItem(REMEMBER_PASSWORD_KEY);
      return;
    }
    window.localStorage.setItem(REMEMBER_DRAFTS_KEY, "1");
    window.localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    window.localStorage.setItem(REMEMBER_PASSWORD_KEY, password);
  }, [email, password, rememberMe]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password, rememberMe);
      if (typeof window !== "undefined" && !rememberMe) {
        window.localStorage.removeItem(REMEMBER_DRAFTS_KEY);
        window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
        window.localStorage.removeItem(REMEMBER_PASSWORD_KEY);
      }
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
            <div className="relative mt-1">
              <input
                id="dashboard-login-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-border bg-white py-2 pl-3 pr-11 text-sm outline-none focus:border-[#B9974A] focus:ring-2 focus:ring-[#B9974A]/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#7A6A58] transition-colors hover:bg-[#F5F0E8] hover:text-[#1F2420]"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                )}
              </button>
            </div>
          </label>

          <div className="flex items-center gap-2">
            <input
              id={rememberId}
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-[#B9974A]/30"
            />
            <label htmlFor={rememberId} className="text-sm text-[#1F2420]">
              Remember me on this device
            </label>
          </div>

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
