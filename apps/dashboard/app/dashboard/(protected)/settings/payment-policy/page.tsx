"use client";

import {
  ApiClientError,
  getDashboardPaymentPolicy,
  patchDashboardPaymentPolicy,
} from "@rouby/api-client";
import { useEffect, useState } from "react";
import { useDashboardAuth } from "@/lib/dashboard-auth";

type LoadState = "loading" | "loaded" | "error";

function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected API error.";
}

export default function DashboardPaymentPolicyPage() {
  const { token, hasPermission } = useDashboardAuth();
  const canRead =
    hasPermission("payments.policy.read") ||
    hasPermission("payments.policy.manage");
  const canManage = hasPermission("payments.policy.manage");

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [paymentDepositPolicy, setPaymentDepositPolicy] =
    useState("PAY_AT_SALON");

  async function loadData() {
    if (!token || !canRead) {
      return;
    }
    setState("loading");
    setError("");
    try {
      const response = await getDashboardPaymentPolicy(token);
      setPaymentDepositPolicy(response.paymentDepositPolicy);
      setState("loaded");
    } catch (requestError) {
      setError(formatApiError(requestError));
      setState("error");
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManage) {
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const response = await patchDashboardPaymentPolicy(token, {
        paymentDepositPolicy,
      });
      setPaymentDepositPolicy(response.paymentDepositPolicy);
      setSaveSuccess("Payment policy updated.");
    } catch (requestError) {
      setSaveError(formatApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
        You do not have permission to view payment policy settings.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1F2420]">Payment Policy</h1>
        <p className="mt-2 text-sm text-[#7A6A58]">
          Configure the salon payment and deposit policy.
        </p>
      </header>

      {state === "loading" ? (
        <section className="rounded-xl border border-border bg-card p-5 text-sm text-[#7A6A58] shadow-sm">
          Loading payment policy...
        </section>
      ) : null}
      {state === "error" ? (
        <section className="rounded-xl border border-[#E7B9A4] bg-[#FFF1EC] p-5 text-sm text-danger shadow-sm">
          {error}
        </section>
      ) : null}

      {state === "loaded" ? (
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          {!canManage ? (
            <p className="mb-4 rounded-md border border-[#E8D9BC] bg-[#FFF9EE] px-3 py-2 text-sm text-[#7A6A58]">
              You can view this policy but cannot edit it.
            </p>
          ) : null}

          <label className="text-sm">
            <span className="mb-1 block font-medium text-[#1F2420]">
              Payment deposit policy
            </span>
            <select
              value={paymentDepositPolicy}
              onChange={(event) => setPaymentDepositPolicy(event.target.value)}
              disabled={!canManage}
              className="w-full rounded-md border border-border bg-white px-3 py-2 disabled:bg-[#F5F1EA]"
            >
              <option value="PAY_AT_SALON">PAY_AT_SALON</option>
              <option value="DEPOSIT_REQUIRED">DEPOSIT_REQUIRED</option>
            </select>
          </label>

          {saveError ? (
            <p className="mt-4 rounded-md border border-[#E7B9A4] bg-[#FFF1EC] px-3 py-2 text-sm text-danger">
              {saveError}
            </p>
          ) : null}
          {saveSuccess ? (
            <p className="mt-4 rounded-md border border-[#C9DEC5] bg-[#EEF8EE] px-3 py-2 text-sm text-[#1E6A3A]">
              {saveSuccess}
            </p>
          ) : null}

          {canManage ? (
            <div className="mt-4">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save payment policy"}
              </button>
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
