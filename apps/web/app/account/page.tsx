"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountAuthShell } from "@/components/account/account-auth-shell";
import { getClientToken, subscribeClientSession } from "@/lib/auth/client-session";

export default function AccountPage() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    function sync(): void {
      setSignedIn(Boolean(getClientToken()));
    }
    sync();
    return subscribeClientSession(sync);
  }, []);

  return (
    <AccountAuthShell
      title="My Account"
      subtitle="Manage your salon visits, bookings, and profile in one refined place."
    >
      {signedIn ? (
        <div className="rounded-2xl border border-[#d8cdb9]/60 bg-[#f3ebdd]/40 px-5 py-4 text-center text-sm text-foreground">
          <p className="font-medium text-primary">You are signed in.</p>
          <p className="mt-1 text-muted">View appointments or sign out from your device when finished.</p>
          <Link
            href="/account/bookings"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_8px_20px_rgba(23,53,31,0.2)] transition-opacity hover:opacity-90"
          >
            My Bookings
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/account/sign-in"
          className="group flex flex-col rounded-2xl border border-[#d8cdb9] bg-[#fdfaf4] p-6 text-left transition-all hover:border-primary/40 hover:shadow-[0_12px_32px_rgba(23,53,31,0.12)]"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6e775d]">
            Returning
          </span>
          <span className="mt-2 font-heading text-2xl text-primary group-hover:text-[#1a4028]">
            Sign In
          </span>
          <span className="mt-2 text-sm leading-relaxed text-muted">
            Use your mobile number. We will send a one-time code by SMS.
          </span>
        </Link>
        <Link
          href="/account/register"
          className="group flex flex-col rounded-2xl border border-[#d8cdb9] bg-[#fdfaf4] p-6 text-left transition-all hover:border-accent/50 hover:shadow-[0_12px_32px_rgba(185,151,74,0.15)]"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6e775d]">
            New guest
          </span>
          <span className="mt-2 font-heading text-2xl text-primary group-hover:text-[#1a4028]">
            Create Account
          </span>
          <span className="mt-2 text-sm leading-relaxed text-muted">
            Register with your name and phone to book and manage visits online.
          </span>
        </Link>
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        Prefer to book first?{" "}
        <Link href="/booking" className="font-medium text-primary underline-offset-4 hover:underline">
          Start a booking
        </Link>
      </p>
    </AccountAuthShell>
  );
}
