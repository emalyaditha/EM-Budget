import { apiUrl, safeJson } from "./api";

/** In-memory session — never persisted to localStorage (XSS-resistant). */
let sessionEmail: string | null = null;
let sessionToken: string | null = null;
let deviceToken: string | null = null;

export function setAuthSession(email: string, token: string, device?: string) {
  sessionEmail = email.trim().toLowerCase();
  sessionToken = token;
  if (device) deviceToken = device;
}

export function clearAuthSession() {
  sessionEmail = null;
  sessionToken = null;
  deviceToken = null;
}

export function getSessionEmail(): string | null {
  return sessionEmail;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export function getDeviceToken(): string | null {
  return deviceToken;
}

export async function fetchSessionFromServer(): Promise<{ email: string; token: string; deviceToken?: string } | null> {
  try {
    const resp = await fetch(apiUrl('/api/auth/session'), { credentials: 'include' });
    if (!resp.ok) return null;
    const data = await safeJson(resp);
    if (!data?.success || !data.email || !data.token) return null;
    setAuthSession(data.email, data.token, data.deviceToken);
    return { email: data.email, token: data.token, deviceToken: data.deviceToken };
  } catch {
    return null;
  }
}

export async function logoutSession(): Promise<void> {
  try {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
  } finally {
    clearAuthSession();
  }
}
