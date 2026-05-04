"use client";

import { useState } from "react";
import Link from "next/link";
import { postDashboardAuthLogin } from "@rouby/api-client";

const TOKEN_KEY = "dashboard_access_token";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[] | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPermissions(null);
    setLoading(true);
    try {
      const data = await postDashboardAuthLogin(email, password);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(TOKEN_KEY, data.accessToken);
      }
      const base = process.env.NEXT_PUBLIC_API_URL ?? "";
      const permRes = await fetch(`${base.replace(/\/$/, "")}/dashboard/auth/permissions`, {
        headers: { Authorization: `Bearer ${data.accessToken}` },
      });
      if (!permRes.ok) {
        const t = await permRes.text();
        throw new Error(t || `permissions ${permRes.status}`);
      }
      const permJson = (await permRes.json()) as { permissions: string[] };
      setPermissions(permJson.permissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard sign in</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Sprint 1 — minimal login (no production styling).
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-zinc-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {permissions ? (
          <p className="mt-4 text-xs text-zinc-600">
            Signed in. <strong>{permissions.length}</strong> permissions loaded (token in
            sessionStorage).
          </p>
        ) : null}
        <p className="mt-6 text-center text-sm text-zinc-500">
          <Link href="/" className="underline underline-offset-2">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
