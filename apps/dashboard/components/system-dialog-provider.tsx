"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type SystemConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

export type SystemAlertOptions = {
  title?: string;
  message: string;
  okLabel?: string;
};

type ConfirmPayload = Required<Pick<SystemConfirmOptions, "message">> &
  Omit<SystemConfirmOptions, "message"> & { resolve: (value: boolean) => void };

type AlertPayload = Required<Pick<SystemAlertOptions, "message">> &
  Omit<SystemAlertOptions, "message"> & { resolve: () => void };

type DialogOpen = { kind: "confirm"; payload: ConfirmPayload } | { kind: "alert"; payload: AlertPayload };

type SystemDialogContextValue = {
  confirm: (input: string | SystemConfirmOptions) => Promise<boolean>;
  alert: (input: string | SystemAlertOptions) => Promise<void>;
};

const SystemDialogContext = createContext<SystemDialogContextValue | null>(null);

export function SystemDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogOpen | null>(null);
  const dialogRef = useRef<DialogOpen | null>(null);
  const titleId = useId();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  dialogRef.current = dialog;

  const settle = useCallback(() => {
    setDialog(null);
  }, []);

  const confirm = useCallback((input: string | SystemConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const opts = typeof input === "string" ? { message: input } : input;
      setDialog({
        kind: "confirm",
        payload: {
          message: opts.message,
          title: opts.title,
          confirmLabel: opts.confirmLabel ?? "Continue",
          cancelLabel: opts.cancelLabel ?? "Cancel",
          tone: opts.tone ?? "default",
          resolve,
        },
      });
    });
  }, []);

  const alert = useCallback((input: string | SystemAlertOptions) => {
    return new Promise<void>((resolve) => {
      const opts = typeof input === "string" ? { message: input } : input;
      setDialog({
        kind: "alert",
        payload: {
          message: opts.message,
          title: opts.title,
          okLabel: opts.okLabel ?? "OK",
          resolve,
        },
      });
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const current = dialogRef.current;
      if (!current) return;
      if (current.kind === "confirm") {
        current.payload.resolve(false);
      } else {
        current.payload.resolve();
      }
      settle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, settle]);

  useEffect(() => {
    if (!dialog) return;
    const id = window.requestAnimationFrame(() => {
      confirmButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [dialog]);

  function dismissConfirm(confirmed: boolean) {
    if (!dialog || dialog.kind !== "confirm") return;
    dialog.payload.resolve(confirmed);
    settle();
  }

  function dismissAlert() {
    if (!dialog || dialog.kind !== "alert") return;
    dialog.payload.resolve();
    settle();
  }

  const payload = dialog?.kind === "confirm" || dialog?.kind === "alert" ? dialog.payload : null;

  return (
    <SystemDialogContext.Provider value={{ confirm, alert }}>
      {children}
      {dialog && payload ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-[#2A1722]/50 backdrop-blur-[1px]"
            aria-label={dialog.kind === "confirm" ? "Dismiss dialog" : "Close dialog"}
            onClick={() => (dialog.kind === "confirm" ? dismissConfirm(false) : dismissAlert())}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-[#FFFCF6] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border/70 bg-white/60 px-5 py-4 sm:px-6">
              {payload.title ? (
                <>
                  <h2 id={titleId} className="text-base font-semibold tracking-tight text-[#1F2420]">
                    {payload.title}
                  </h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#4A4338]">{payload.message}</p>
                </>
              ) : (
                <p id={titleId} className="whitespace-pre-line text-sm leading-relaxed text-[#4A4338]">
                  {payload.message}
                </p>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border/60 bg-[#FFFCF6]/80 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              {dialog.kind === "confirm" ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-[#1F2420] shadow-sm transition hover:bg-[#FFF9EE]"
                    onClick={() => dismissConfirm(false)}
                  >
                    {dialog.payload.cancelLabel}
                  </button>
                  <button
                    ref={confirmButtonRef}
                    type="button"
                    className={
                      dialog.payload.tone === "danger"
                        ? "rounded-lg bg-[#B5472D] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
                        : "rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-95"
                    }
                    onClick={() => dismissConfirm(true)}
                  >
                    {dialog.payload.confirmLabel}
                  </button>
                </>
              ) : (
                <button
                  ref={confirmButtonRef}
                  type="button"
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-95 sm:min-w-[96px]"
                  onClick={() => dismissAlert()}
                >
                  {dialog.payload.okLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </SystemDialogContext.Provider>
  );
}

export function useSystemDialog(): SystemDialogContextValue {
  const ctx = useContext(SystemDialogContext);
  if (!ctx) {
    throw new Error("useSystemDialog must be used within SystemDialogProvider");
  }
  return ctx;
}
