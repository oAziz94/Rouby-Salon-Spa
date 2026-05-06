"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/states/error-state";
import { postPublicJson } from "@/lib/api/client";
import { setClientPhone, setClientToken } from "@/lib/auth/client-session";

type OtpRequestResponse = { success: true; expiresIn: number; phone: string; devCode?: string };
type OtpVerifyResponse = {
  accessToken: string;
  expiresIn: number;
  client: { id: string; fullName: string; phone: string; email: string | null };
};

export default function AccountPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otpRequested, setOtpRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  const canRequestOtp = useMemo(() => phone.trim().length > 0 && !loading, [phone, loading]);
  const canVerifyOtp = useMemo(
    () => phone.trim().length > 0 && code.trim().length >= 4 && !loading,
    [phone, code, loading],
  );

  async function handleRequestOtp() {
    setLoading(true);
    setError(null);
    try {
      const response = await postPublicJson<OtpRequestResponse>("/client/auth/otp/request", {
        phone: phone.trim(),
      });
      setPhone(response.phone);
      setDevCode(response.devCode ?? null);
      setOtpRequested(true);
      setSignedIn(false);
    } catch (err) {
      setSignedIn(false);
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setLoading(true);
    setError(null);
    try {
      const response = await postPublicJson<OtpVerifyResponse>("/client/auth/otp/verify", {
        phone: phone.trim(),
        code: code.trim(),
      });
      setClientToken(response.accessToken);
      setClientPhone(response.client.phone);
      setSignedIn(true);
      setPhone(response.client.phone);
      setDevCode(null);
    } catch (err) {
      setSignedIn(false);
      setError(err instanceof Error ? err.message : "Unable to verify OTP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[920px] px-4 py-14 sm:px-6 lg:px-10">
      <section className="rounded-2xl border border-border bg-card p-7">
        <h1 className="font-heading text-4xl text-primary">My Account</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
          Sign in using your phone number and one-time verification code.
        </p>

        <div className="mt-6 grid gap-3">
          <label className="text-sm text-muted">
            Phone
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          {otpRequested ? (
            <label className="text-sm text-muted">
              Verification Code
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
          ) : null}
        </div>
        {devCode ? (
          <p className="mt-2 text-sm text-muted">Development OTP: {devCode}</p>
        ) : null}

        {error ? (
          <div className="mt-4">
            <ErrorState message={error} />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleRequestOtp()}
            disabled={!canRequestOtp}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send OTP"}
          </button>
          <button
            type="button"
            onClick={() => void handleVerifyOtp()}
            disabled={!canVerifyOtp}
            className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify OTP"}
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
