"use client";

import type { FormEvent } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AccountAuthShell } from "@/components/account/account-auth-shell";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { postPublicJson } from "@/lib/api/client";
import { setClientPhone, setClientToken } from "@/lib/auth/client-session";
import {
  ACCOUNT_REGISTER_FULL_NAME_KEY,
  type OtpVerifyResponse,
} from "@/lib/auth/client-otp";

function safeDecode(param: string | null): string {
  if (!param) {
    return "";
  }
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

function AccountVerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modeRaw = (searchParams.get("mode") ?? "").toLowerCase();
  const phoneParam = searchParams.get("phone");
  const nameParam = safeDecode(searchParams.get("name"));

  const mode = modeRaw === "signin" || modeRaw === "register" ? modeRaw : null;
  const phone = phoneParam ? safeDecode(phoneParam) : "";

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setDevCode(window.sessionStorage.getItem("alroubyClientOtpDev"));
  }, []);

  const title = mode === "register" ? "Confirm registration" : "Verify your number";
  const subtitle =
    mode === "register"
      ? `Enter the code we sent to ${phone || "your mobile"} to finish creating your account.`
      : `Enter the code we sent to ${phone || "your mobile"} to sign in.`;

  const canSubmit = useMemo(
    () => Boolean(phone && code.trim().length >= 4 && !loading && mode),
    [phone, code, loading, mode],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!mode || !phone) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body: { phone: string; code: string; fullName?: string } = {
        phone: phone.trim(),
        code: code.trim(),
      };
      if (mode === "register") {
        const fromStore =
          typeof window !== "undefined"
            ? window.sessionStorage.getItem(ACCOUNT_REGISTER_FULL_NAME_KEY)?.trim() ?? ""
            : "";
        const resolved = fromStore || nameParam.trim();
        if (resolved.length < 2) {
          setError("Full name is missing. Please return to registration and try again.");
          setLoading(false);
          return;
        }
        body.fullName = resolved;
      }
      const response = await postPublicJson<OtpVerifyResponse>("/client/auth/otp/verify", body);
      setClientToken(response.accessToken);
      setClientPhone(response.client.phone);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("alroubyClientOtpDev");
        window.sessionStorage.removeItem(ACCOUNT_REGISTER_FULL_NAME_KEY);
      }
      router.push("/account/bookings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify code.");
    } finally {
      setLoading(false);
    }
  }

  if (!mode || !phone.trim()) {
    return (
      <AccountAuthShell
        title="Session incomplete"
        subtitle="We could not start verification. Please request a new code from sign in or registration."
      >
        <div className="space-y-4">
          <ErrorState message="Missing verification details. Start again from sign in or create account." />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/account/sign-in"
              className="inline-flex flex-1 items-center justify-center rounded-full bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/account/register"
              className="inline-flex flex-1 items-center justify-center rounded-full border border-primary px-4 py-3 text-center text-sm font-semibold text-primary"
            >
              Create account
            </Link>
          </div>
        </div>
      </AccountAuthShell>
    );
  }

  return (
    <AccountAuthShell title={title} subtitle={subtitle}>
      <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)}>
        <label className="block text-sm font-medium text-foreground">
          Verification code
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Enter code"
            className="mt-2 w-full rounded-xl border border-[#d8cdb9] bg-[#fffdf8] px-4 py-3 text-sm tracking-widest text-foreground outline-none ring-accent/30 transition-shadow focus:ring-2"
          />
        </label>
        {devCode ? (
          <p className="text-center text-sm text-muted">Development OTP: {devCode}</p>
        ) : null}
        {error ? (
          <div>
            <ErrorState message={error} />
          </div>
        ) : null}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-full bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_20px_rgba(23,53,31,0.2)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
        >
          {loading ? "Verifying…" : "Verify and continue"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Wrong number?{" "}
        <Link
          href={mode === "register" ? "/account/register" : "/account/sign-in"}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Go back
        </Link>
      </p>
    </AccountAuthShell>
  );
}

export default function AccountVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-5rem)] bg-[#faf7f0] pt-28 pb-16">
          <div className="mx-auto max-w-lg px-4">
            <LoadingState label="Preparing verification…" />
          </div>
        </div>
      }
    >
      <AccountVerifyInner />
    </Suspense>
  );
}
