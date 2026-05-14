"use client";

import {
  ApiClientError,
  getDashboardAuthMe,
  getDashboardAuthPermissions,
  postDashboardAuthLogin,
  type DashboardAuthMeResponse,
} from "@rouby/api-client";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const TOKEN_KEY = "dashboard_access_token";
const TOKEN_BRIDGE_KEY = "dashboard_access_token_bridge";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

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
};

const DashboardAuthContext = createContext<DashboardAuthContextType | null>(null);

function readToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const fromSession = sessionStorage.getItem(TOKEN_KEY);
  if (fromSession) {
    return fromSession;
  }
  const fromPersistent = localStorage.getItem(TOKEN_KEY);
  if (fromPersistent) {
    return fromPersistent;
  }
  return localStorage.getItem(TOKEN_BRIDGE_KEY);
}

function writeToken(token: string | null, rememberMe = false): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_BRIDGE_KEY);
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    if (rememberMe) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      // Bridge token allows opening protected dashboard pages in a new tab.
      // Explicit logout still clears it.
      localStorage.setItem(TOKEN_BRIDGE_KEY, token);
    }
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

  const refreshUser = useCallback(async () => {
    const existingToken = readToken();
    if (!existingToken) {
      return;
    }
    try {
      const me = await getDashboardAuthMe(existingToken);
      setUser(me);
    } catch {
      // Leave existing user state; caller may show an error toast.
    }
  }, []);

  const logout = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
    setPermissions([]);
    setAuthError(null);
    setStatus("unauthenticated");
  }, []);

  const bootstrap = useCallback(
    async (existingToken: string) => {
      try {
        const [me, perms] = await Promise.all([
          getDashboardAuthMe(existingToken),
          getDashboardAuthPermissions(existingToken),
        ]);

        setToken(existingToken);
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
          logout();
          if (pathname !== "/dashboard/login") {
            router.replace("/dashboard/login?reason=expired");
          }
          return;
        }

        if (apiError.statusCode === 403) {
          setStatus("authenticated");
          setPermissions([]);
          return;
        }

        logout();
      }
    },
    [logout, pathname, router],
  );

  useEffect(() => {
    const existingToken = readToken();
    if (!existingToken) {
      setStatus("unauthenticated");
      return;
    }

    void bootstrap(existingToken);
  }, [bootstrap]);

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const loginResponse = await postDashboardAuthLogin(email, password);
      writeToken(loginResponse.accessToken, rememberMe);
      setStatus("loading");
      await bootstrap(loginResponse.accessToken);
      router.replace("/dashboard");
    },
    [bootstrap, router],
  );

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
    }),
    [authError, hasPermission, login, logout, permissions, refreshUser, status, token, user],
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
