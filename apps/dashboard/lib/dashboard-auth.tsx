"use client";

import {
  ApiClientError,
  getDashboardAuthMe,
  getDashboardAuthPermissions,
  jwtSecondsToExpiry,
  postDashboardAuthLogin,
  postDashboardAuthLogout,
  postDashboardAuthRefresh,
  setDashboardAccessTokenRefresher,
  type DashboardAuthMeResponse,
} from "@rouby/api-client";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const TOKEN_KEY = "dashboard_access_token";
const TOKEN_BRIDGE_KEY = "dashboard_access_token_bridge";
const REFRESH_KEY = "dashboard_refresh_token";
const REMEMBER_KEY = "dashboard_remember_me";

/** Renew this long before the access token expires (and whenever a tab wakes up inside it). */
const RENEW_AHEAD_SECONDS = 120;

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

type DashboardAuthContextType = {
  status: AuthStatus;
  user: DashboardAuthMeResponse | null;
  permissions: string[];
  token: string | null;
  authError: ApiClientError | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  hasPermission: (permission?: string) => boolean;
  refreshUser: () => Promise<void>;
  /** Re-run session bootstrap after a network/server error (keeps the token). */
  retry: () => void;
};

const DashboardAuthContext = createContext<DashboardAuthContextType | null>(null);

type StoredSession = { accessToken: string; refreshToken: string | null; rememberMe: boolean };

function readSession(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const accessToken =
      sessionStorage.getItem(TOKEN_KEY) ??
      localStorage.getItem(TOKEN_KEY) ??
      localStorage.getItem(TOKEN_BRIDGE_KEY);
    if (!accessToken) return null;
    const refreshToken =
      sessionStorage.getItem(REFRESH_KEY) ?? localStorage.getItem(REFRESH_KEY);
    const rememberMe = localStorage.getItem(REMEMBER_KEY) === "1";
    return { accessToken, refreshToken, rememberMe };
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_BRIDGE_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    if (!session) return;
    sessionStorage.setItem(TOKEN_KEY, session.accessToken);
    if (session.refreshToken) sessionStorage.setItem(REFRESH_KEY, session.refreshToken);
    if (session.rememberMe) {
      localStorage.setItem(TOKEN_KEY, session.accessToken);
      if (session.refreshToken) localStorage.setItem(REFRESH_KEY, session.refreshToken);
      localStorage.setItem(REMEMBER_KEY, "1");
    } else {
      // Bridge copy lets a protected page open in a new tab; explicit logout clears it.
      localStorage.setItem(TOKEN_BRIDGE_KEY, session.accessToken);
      if (session.refreshToken) localStorage.setItem(REFRESH_KEY, session.refreshToken);
    }
  } catch {
    // Private mode / blocked storage: the in-memory session still works for this tab.
  }
}

export function DashboardAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<DashboardAuthMeResponse | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<ApiClientError | null>(null);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshing = useRef<Promise<string | null> | null>(null);
  // Bumped on every sign-out so a renewal that finishes afterwards cannot resurrect the session.
  const sessionEpoch = useRef(0);

  const clearRenewTimer = useCallback(() => {
    if (renewTimer.current) {
      clearTimeout(renewTimer.current);
      renewTimer.current = null;
    }
  }, []);

  const endSession = useCallback(
    (reason: "expired" | "manual") => {
      sessionEpoch.current += 1;
      clearRenewTimer();
      writeSession(null);
      setToken(null);
      setUser(null);
      setPermissions([]);
      setAuthError(null);
      setStatus("unauthenticated");
      if (reason === "expired" && pathname !== "/dashboard/login") {
        router.replace("/dashboard/login?reason=expired");
      }
    },
    [clearRenewTimer, pathname, router],
  );

  /**
   * Exchange the stored refresh token for a new access token. One call at a time; a second
   * caller gets the same promise. Returns null when the session cannot be renewed.
   */
  const renewAccessToken = useCallback(async (): Promise<string | null> => {
    if (refreshing.current) return refreshing.current;
    const run = (async () => {
      const current = readSession();
      if (!current?.refreshToken) return null;
      const epoch = sessionEpoch.current;
      try {
        const next = await postDashboardAuthRefresh(current.refreshToken);
        if (epoch !== sessionEpoch.current) return null;
        writeSession({
          accessToken: next.accessToken,
          refreshToken: next.refreshToken ?? current.refreshToken,
          rememberMe: current.rememberMe,
        });
        setToken(next.accessToken);
        return next.accessToken;
      } catch (error) {
        if (epoch !== sessionEpoch.current) return null;
        if (error instanceof ApiClientError && error.statusCode === 401) {
          endSession("expired");
        }
        return null;
      }
    })();
    refreshing.current = run.finally(() => {
      refreshing.current = null;
    });
    return refreshing.current;
  }, [endSession]);

  // Let every api-client call retry once with a renewed token after a 401.
  useEffect(() => {
    setDashboardAccessTokenRefresher(async (stale) => {
      const stored = readSession();
      // Another tab may already have renewed: hand back its token without a server call.
      if (stored && stored.accessToken !== stale) {
        const left = jwtSecondsToExpiry(stored.accessToken);
        if (left === null || left > 30) {
          setToken(stored.accessToken);
          return stored.accessToken;
        }
      }
      return renewAccessToken();
    });
    return () => setDashboardAccessTokenRefresher(null);
  }, [renewAccessToken]);

  // Proactive renewal a couple of minutes before expiry, and when a sleeping tab wakes up.
  useEffect(() => {
    clearRenewTimer();
    if (!token) return;
    const left = jwtSecondsToExpiry(token);
    if (left === null) return;
    // Normally RENEW_AHEAD before expiry; with a very short token, halfway through its life.
    const delaySeconds =
      left > RENEW_AHEAD_SECONDS ? left - RENEW_AHEAD_SECONDS : Math.max(15, left / 2);
    const delayMs = delaySeconds * 1000;
    renewTimer.current = setTimeout(() => {
      void renewAccessToken();
    }, delayMs);
    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      const remaining = jwtSecondsToExpiry(token);
      if (remaining !== null && remaining < RENEW_AHEAD_SECONDS) {
        void renewAccessToken();
      }
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      clearRenewTimer();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [clearRenewTimer, renewAccessToken, token]);

  const refreshUser = useCallback(async () => {
    const existing = readSession();
    if (!existing) {
      return;
    }
    try {
      const me = await getDashboardAuthMe(existing.accessToken);
      setUser(me);
    } catch {
      // Leave existing user state; caller may show an error toast.
    }
  }, []);

  const logout = useCallback(() => {
    const existing = readSession();
    if (existing) {
      void postDashboardAuthLogout(existing.accessToken, existing.refreshToken);
    }
    endSession("manual");
  }, [endSession]);

  const bootstrap = useCallback(
    async (existingToken: string) => {
      try {
        const [me, perms] = await Promise.all([
          getDashboardAuthMe(existingToken),
          getDashboardAuthPermissions(existingToken),
        ]);

        // apiFetch may have renewed the token while answering; keep the newest one.
        setToken(readSession()?.accessToken ?? existingToken);
        setUser(me);
        setPermissions(
          Array.isArray(perms.permissions) ? perms.permissions : [],
        );
        setAuthError(null);
        setStatus("authenticated");
      } catch (error) {
        const apiError =
          error instanceof ApiClientError
            ? error
            : new ApiClientError("Authentication bootstrap failed", 500);
        setAuthError(apiError);

        if (apiError.statusCode === 401) {
          endSession("expired");
          return;
        }

        if (apiError.statusCode === 403) {
          setStatus("authenticated");
          setPermissions([]);
          return;
        }

        // Network error, timeout, or 5xx: keep the token and let the user retry.
        setStatus("error");
      }
    },
    [endSession],
  );

  useEffect(() => {
    const existing = readSession();
    if (!existing) {
      setStatus("unauthenticated");
      return;
    }
    const left = jwtSecondsToExpiry(existing.accessToken);
    if (left !== null && left < 30 && existing.refreshToken) {
      // Came back after the access token lapsed: renew first, then load the user.
      void renewAccessToken().then((fresh) => {
        if (fresh) void bootstrap(fresh);
        else if (readSession()) void bootstrap(existing.accessToken);
      });
      return;
    }
    void bootstrap(existing.accessToken);
  }, [bootstrap, renewAccessToken]);

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const loginResponse = await postDashboardAuthLogin(email, password);
      writeSession({
        accessToken: loginResponse.accessToken,
        refreshToken: loginResponse.refreshToken ?? null,
        rememberMe,
      });
      setStatus("loading");
      await bootstrap(loginResponse.accessToken);
      router.replace("/dashboard");
    },
    [bootstrap, router],
  );

  const retry = useCallback(() => {
    const existing = readSession();
    if (!existing) {
      setStatus("unauthenticated");
      return;
    }
    setStatus("loading");
    void bootstrap(existing.accessToken);
  }, [bootstrap]);

  const hasPermission = useCallback(
    (permission?: string) => {
      if (!permission) {
        return true;
      }
      return permissions.includes(permission);
    },
    [permissions],
  );

  const value = useMemo<DashboardAuthContextType>(
    () => ({
      status,
      user,
      permissions,
      token,
      authError,
      login,
      logout,
      hasPermission,
      refreshUser,
      retry,
    }),
    [authError, hasPermission, login, logout, permissions, refreshUser, retry, status, token, user],
  );

  return (
    <DashboardAuthContext.Provider value={value}>
      {children}
    </DashboardAuthContext.Provider>
  );
}

export function useDashboardAuth(): DashboardAuthContextType {
  const context = useContext(DashboardAuthContext);
  if (!context) {
    throw new Error("useDashboardAuth must be used within DashboardAuthProvider");
  }
  return context;
}
