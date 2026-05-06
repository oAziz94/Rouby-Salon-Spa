const CLIENT_TOKEN_KEY = "clientAccessToken";
const CLIENT_PHONE_KEY = "clientPhone";

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
  window.sessionStorage.setItem(CLIENT_TOKEN_KEY, token);
}

export function clearClientToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(CLIENT_TOKEN_KEY);
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
