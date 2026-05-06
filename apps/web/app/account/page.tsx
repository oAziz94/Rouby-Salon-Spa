"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/states/error-state";
import { postPublicJson } from "@/lib/api/client";
import { setClientPhone, setClientToken } from "@/lib/auth/client-session";

type DevTokenResponse = {
  accessToken: string;
  expiresIn: number;
  client: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
  };
};

export default function AccountPage() {
  const [fullName, setFullName] = useState("Guest Client");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  const canSubmit = useMemo(
    () => fullName.trim().length > 0 && phone.trim().length > 0 && !loading,
    [fullName, phone, loading],
  );

  async function handleDevSignIn() {
    setLoading(true);
    setError(null);
    try {
      const response = await postPublicJson<DevTokenResponse>("/client/auth/dev/token", {
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      });
      setClientToken(response.accessToken);
      setClientPhone(response.client.phone);
      setSignedIn(true);
      setPhone(response.client.phone);
    } catch (err) {
      setSignedIn(false);
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[920px] px-4 py-14 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-7">
        <h1 className="font-heading text-4xl text-primary">My Account</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
          Client account auth is currently development-ready only. Production OAuth/profile
          endpoints are not fully available yet.
        </p>

        <div className="mt-6 grid gap-3">
          <label className="text-sm text-muted">
            Full Name
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-sm text-muted">
            Phone
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-sm text-muted">
            Email (optional)
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        </div>

        {error ? (
          <div className="mt-4">
            <ErrorState message={error} />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleDevSignIn()}
            disabled={!canSubmit}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in (Dev Token)"}
          </button>
          <Link
            href="/account/bookings"
            className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            Go to My Bookings
          </Link>
          {signedIn ? (
            <span className="rounded-lg border border-accent bg-accent/20 px-3 py-2 text-sm text-foreground">
              Signed in
            </span>
          ) : (
            <span className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted">
              Not signed in
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
