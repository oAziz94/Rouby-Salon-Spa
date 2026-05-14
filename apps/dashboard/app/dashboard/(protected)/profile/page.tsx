"use client";

import {
  ApiClientError,
  patchDashboardAuthProfile,
  postDashboardAuthChangePassword,
} from "@rouby/api-client";
import { useEffect, useState } from "react";
import { useDashboardAuth } from "@/lib/dashboard-auth";

const DEFAULT_INITIAL_PASSWORD = "12345678";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}

type Banner = { type: "ok" | "error"; message: string } | null;

export default function DashboardProfilePage() {
  const { token, user, refreshUser } = useDashboardAuth();
  const [banner, setBanner] = useState<Banner>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.name);
    setPhone(user.phone ?? "");
  }, [user]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setProfileSaving(true);
    setBanner(null);
    try {
      const nextName = fullName.trim();
      if (nextName.length < 2) {
        throw new Error("Name must be at least 2 characters.");
      }
      await patchDashboardAuthProfile(token, {
        fullName: nextName,
        phone: phone.trim() || null,
      });
      await refreshUser();
      setBanner({ type: "ok", message: "Profile updated." });
    } catch (err) {
      setBanner({ type: "error", message: formatApiError(err) });
    } finally {
      setProfileSaving(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setPasswordSaving(true);
    setBanner(null);
    try {
      if (newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters.");
      }
      if (newPassword !== confirmPassword) {
        throw new Error("New password and confirmation do not match.");
      }
      await postDashboardAuthChangePassword(token, {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setBanner({ type: "ok", message: "Password changed. Use your new password next time you sign in." });
    } catch (err) {
      setBanner({ type: "error", message: formatApiError(err) });
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-8">
      <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1F2420]">My profile</h1>
        <p className="mt-2 text-sm text-[#7A6A58]">
          Update how you appear in the dashboard, your phone number, and your sign-in password.
        </p>
        <p className="mt-3 rounded-lg border border-[#E8D4A0]/80 bg-[#FFF9ED] px-3 py-2 text-xs text-[#6B5420]">
          New accounts receive a temporary password of{" "}
          <span className="font-mono font-semibold">{DEFAULT_INITIAL_PASSWORD}</span>
          {" "}until you change it below.
        </p>
      </header>

      {banner ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            banner.type === "ok"
              ? "border border-[#C9DEC5] bg-[#EEF8EE] text-[#1E6A3A]"
              : "border border-[#E7B9A4] bg-[#FFF1EC] text-danger"
          }`}
        >
          {banner.message}
        </p>
      ) : null}

      <form
        onSubmit={(ev) => void saveProfile(ev)}
        className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-[#1F2420]">Contact &amp; display</h2>
        <p className="text-xs text-[#7A6A58]">Email is managed by an administrator and cannot be changed here.</p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[#5C5348]">Full name</span>
          <input
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[#5C5348]">Phone</span>
          <input
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={profileSaving}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {profileSaving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>

      <form
        onSubmit={(ev) => void savePassword(ev)}
        className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-[#1F2420]">Change password</h2>
        <p className="text-xs text-[#7A6A58]">Enter your current password, then choose a new one (at least 8 characters).</p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[#5C5348]">Current password</span>
          <input
            type="password"
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[#5C5348]">New password</span>
          <input
            type="password"
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[#5C5348]">Confirm new password</span>
          <input
            type="password"
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={passwordSaving}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {passwordSaving ? "Updating…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}
