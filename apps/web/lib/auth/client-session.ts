const CLIENT_TOKEN_KEY = "clientAccessToken";
const CLIENT_PHONE_KEY = "clientPhone";

type ClientSessionListener = () => void;
const clientSessionListeners = new Set<ClientSessionListener>();

let crossTabStorageListenerAttached = false;

function emitClientSessionChange(): void {
  for (const listener of clientSessionListeners) {
    listener();
  }
}

function ensureCrossTabStorageListener(): void {
  if (typeof window === "undefined" || crossTabStorageListenerAttached) {
    return;
  }
  crossTabStorageListenerAttached = true;
  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key === CLIENT_TOKEN_KEY || event.key === null) {
      emitClientSessionChange();
    }
  });
}

/** Subscribe to access-token changes (sign-in, sign-out, expiry). Same-tab updates and other-tab `sessionStorage` sync. */
export function subscribeClientSession(listener: ClientSessionListener): () => void {
  ensureCrossTabStorageListener();
  clientSessionListeners.add(listener);
  return () => {
    clientSessionListeners.delete(listener);
  };
}

export function getClientToken(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.sessionStorage.getItem(CLIENT_TOKEN_KEY) ?? "";
}

export function setClientToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const prev = window.sessionStorage.getItem(CLIENT_TOKEN_KEY);
  window.sessionStorage.setItem(CLIENT_TOKEN_KEY, token);
  if (prev !== token) {
    emitClientSessionChange();
  }
}

export function clearClientToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (window.sessionStorage.getItem(CLIENT_TOKEN_KEY) !== null) {
    window.sessionStorage.removeItem(CLIENT_TOKEN_KEY);
    emitClientSessionChange();
  }
}

export function getClientPhone(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.sessionStorage.getItem(CLIENT_PHONE_KEY) ?? "";
}

export function setClientPhone(phone: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(CLIENT_PHONE_KEY, phone);
}

export function clearClientPhone(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(CLIENT_PHONE_KEY);
}

export function clearClientSession(): void {
  clearClientToken();
  clearClientPhone();
}
