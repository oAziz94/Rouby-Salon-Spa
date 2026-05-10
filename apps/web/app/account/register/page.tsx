"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AccountAuthShell } from "@/components/account/account-auth-shell";
import { ErrorState } from "@/components/states/error-state";
import { ClientApiError, postPublicJson } from "@/lib/api/client";
import {
  ACCOUNT_REGISTER_FULL_NAME_KEY,
  CLIENT_OTP_INTENT,
  type OtpRequestResponse,
} from "@/lib/auth/client-otp";

export default function AccountRegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);

  const canSubmit = useMemo(
    () => fullName.trim().length >= 2 && phone.trim().length > 0 && !loading,
    [fullName, phone, loading],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setAlreadyExists(false);
    try {
      const response = await postPublicJson<OtpRequestResponse>("/client/auth/otp/request", {
        phone: phone.trim(),
        intent: CLIENT_OTP_INTENT.REGISTER,
      });
      if (typeof window !== "undefined") {
        if (response.devCode) {
          window.sessionStorage.setItem("alroubyClientOtpDev", response.devCode);
        } else {
          window.sessionStorage.removeItem("alroubyClientOtpDev");
        }
        window.sessionStorage.setItem(ACCOUNT_REGISTER_FULL_NAME_KEY, fullName.trim());
      }
      const q = new URLSearchParams({
        mode: "register",
        phone: response.phone,
      });
      router.push(`/account/verify?${q.toString()}`);
    } catch (err) {
      if (err instanceof ClientApiError && err.code === "CLIENT_ALREADY_EXISTS") {
        setAlreadyExists(true);
        setError(null);
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to send verification code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccountAuthShell
      title="Create Account"
      subtitle="Join Alrouby with your name and mobile. Verification keeps your profile private."
    >
      <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)}>
        <label className="block text-sm font-medium text-foreground">
          Full name
          <input
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Your full name"
            className="mt-2 w-full rounded-xl border border-[#d8cdb9] bg-[#fffdf8] px-4 py-3 text-sm text-foreground outline-none ring-accent/30 transition-shadow focus:ring-2"
          />
        </label>
        <label className="block text-sm font-medium text-foreground">
          Mobile number
          <input
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+20 …"
            className="mt-2 w-full rounded-xl border border-[#d8cdb9] bg-[#fffdf8] px-4 py-3 text-sm text-foreground outline-none ring-accent/30 transition-shadow focus:ring-2"
          />
        </label>

        {alreadyExists ? (
          <div className="rounded-xl border border-[#d8cdb9] bg-[#f3ebdd]/50 px-4 py-3 text-sm text-foreground">
            <p>An account already exists for this number.</p>
            <Link
              href="/account/sign-in"
              className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-primary bg-transparent px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Sign in instead
            </Link>
          </div>
        ) : null}

        {error && !alreadyExists ? (
          <div>
            <ErrorState message={error} />
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-full bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_20px_rgba(23,53,31,0.2)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
        >
          {loading ? "Sending code…" : "Continue"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/account" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to account
        </Link>
        {" · "}
        <Link
          href="/account/sign-in"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Already registered?
        </Link>
      </p>
    </AccountAuthShell>
  );
}
