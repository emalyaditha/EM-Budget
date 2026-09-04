import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { apiUrl, safeJson, fetchWithTimeout } from "./api";
import { getSupabaseConfig } from "../supabase";

const jsonHeaders = () => {
  const cfg = getSupabaseConfig();
  return {
    "Content-Type": "application/json",
    "x-supabase-url": cfg.url,
    "x-supabase-key": cfg.key,
  };
};

export type AppLockStatus = {
  appLockEnabled: boolean;
  lockOnOpen: boolean;
  lockIdleMinutes: number | null;
  pinEnabled: boolean;
  hasPin: boolean;
  biometricCount: number;
  failedAttempts: number;
  lockedUntil: number | null;
  webauthnRpid?: string;
};

export type TrustedDevice = {
  id: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  userAgent: string;
};

async function post<T = any>(path: string, body: Record<string, unknown>): Promise<{ resp: Response; data: T }> {
  const resp = await fetchWithTimeout(apiUrl(path), { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) });
  const data = (await safeJson(resp)) as T;
  return { resp, data };
}

export async function getAppLockStatus(email: string): Promise<AppLockStatus | null> {
  try {
    const { resp, data } = await post<{ success?: boolean; error?: string } & AppLockStatus>("/api/app-lock/status", { email });
    if (resp.status === 401) return null;
    if (!resp.ok || !data.success) return null;
    return data;
  } catch {
    return null;
  }
}

// --- PIN ---

export async function setPin(email: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { resp, data } = await post<{ success?: boolean; error?: string }>("/api/app-lock/pin/set", { email, pin });
    return { ok: resp.ok && !!data?.success, error: data?.error || (resp.ok ? undefined : "Failed to set PIN.") };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to set PIN." };
  }
}

export async function disablePin(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { resp, data } = await post<{ success?: boolean; error?: string }>("/api/app-lock/pin/disable", { email });
    return { ok: resp.ok && !!data?.success, error: data?.error || (resp.ok ? undefined : "Failed to disable PIN.") };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to disable PIN." };
  }
}

// "Always ask for PIN on open": when enabled, the app-lock gate is required on
// every startup regardless of this browser being a trusted device.
export async function setLockOnOpen(email: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const { resp, data } = await post<{ success?: boolean; error?: string }>("/api/app-lock/pin/always-lock", { email, enabled });
    return { ok: resp.ok && !!data?.success, error: data?.error || (resp.ok ? undefined : "Failed to update lock preference.") };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update lock preference." };
  }
}

// Idle auto-lock timeout in whole minutes. The app re-locks after this many
// minutes of inactivity when unlocked.
export async function setLockIdleMinutes(email: string, minutes: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const { resp, data } = await post<{ success?: boolean; error?: string }>("/api/app-lock/pin/idle-minutes", { email, minutes });
    return { ok: resp.ok && !!data?.success, error: data?.error || (resp.ok ? undefined : "Failed to update idle-lock timeout.") };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update idle-lock timeout." };
  }
}

export type PinVerifyResult = {
  ok: boolean;
  success?: boolean;
  error?: string;
  code?: string;
  attemptsRemaining?: number;
  retryAfter?: number;
};

export async function verifyPin(email: string, pin: string): Promise<PinVerifyResult> {
  try {
    const { resp, data } = await post<PinVerifyResult>("/api/app-lock/pin/verify", { email, pin });
    // Server responds with `success: true/false` (not `ok`); align the client result.
    return { ok: resp.ok && (!!data.ok || !!data.success), ...data };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Could not verify PIN." };
  }
}

export async function resetPin(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { resp, data } = await post<{ success?: boolean; error?: string }>("/api/app-lock/pin/reset", { email });
    return { ok: resp.ok && !!data?.success, error: data?.error || (resp.ok ? undefined : "Failed to reset PIN.") };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to reset PIN." };
  }
}

// --- WebAuthn ---

export async function startBiometricRegistration(email: string, deviceLabel: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // 1. Ask server for registration options (challenge bound to session)
    const { resp, data } = await post<{ success?: boolean; error?: string; stateId?: string; options?: any }>(
      "/api/app-lock/webauthn/register-options",
      { email, deviceLabel }
    );
    if (!resp.ok || !data.success || !data.stateId || !data.options) {
      return { ok: false, error: data?.error || "Unable to start biometric registration." };
    }
    // 2. Authenticator key-pair creation happens client-side (platform authenticator, user verification required)
    const attResp = await startRegistration(data.options);
    // 3. Send the attestation back for verification + storage
    const verify = await post<{ success?: boolean; error?: string }>("/api/app-lock/webauthn/register-verify", {
      email,
      stateId: data.stateId,
      credential: attResp,
      deviceLabel,
    });
    if (!verify.resp.ok || !verify.data?.success) {
      return { ok: false, error: verify.data?.error || "Biometric registration was not confirmed." };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Biometric registration failed." };
  }
}

export async function removeBiometricCredential(email: string, credentialId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { resp, data } = await post<{ success?: boolean; error?: string }>("/api/app-lock/webauthn/remove", { email, credentialId });
    return { ok: resp.ok && !!data?.success, error: data?.error || (resp.ok ? undefined : "Failed to remove biometric.") };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to remove biometric." };
  }
}

export type BiometricCredential = {
  credentialId: string;
  deviceLabel: string;
  createdAt: number;
};

export async function listBiometricCredentials(email: string): Promise<BiometricCredential[]> {
  try {
    const { resp, data } = await post<{ success?: boolean; credentials?: BiometricCredential[] }>("/api/app-lock/webauthn/list", { email });
    if (!resp.ok || !data?.success) return [];
    return data.credentials || [];
  } catch {
    return [];
  }
}

export type BiometricUnlockResult = {
  ok: boolean;
  error?: string;
  unavailable?: boolean;
};

export async function biometricUnlock(email: string): Promise<BiometricUnlockResult> {
  try {
    // 1. Ask server for authentication options
    const { resp, data } = await post<{ success?: boolean; error?: string; code?: string; stateId?: string; options?: any }>(
      "/api/app-lock/webauthn/authentication-options",
      { email }
    );
    if (!resp.ok || !data.success || !data.stateId || !data.options) {
      return { ok: false, error: data?.error || "Unable to start biometric unlock.", unavailable: data?.code === "NO_CREDS" };
    }
    // 2. Prompt for the platform authenticator
    const assertion = await startAuthentication(data.options);
    // 3. Verify the assertion server-side
    const verify = await post<{ success?: boolean; error?: string }>("/api/app-lock/webauthn/authentication-verify", {
      email,
      stateId: data.stateId,
      credential: assertion,
    });
    if (!verify.resp.ok || !verify.data?.success) {
      return { ok: false, error: verify.data?.error || "Biometric unlock was not verified." };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Biometric unlock failed.", unavailable: /not|unsupported|no credential|cancel/i.test(String(err?.message || "")) ? true : false };
  }
}

// --- Trusted devices ---

export type DeviceCheckResult = { trusted: boolean; email?: string };

export async function checkTrustedDevice(): Promise<DeviceCheckResult> {
  try {
    const { resp, data } = await post<{ success?: boolean; trusted?: boolean; email?: string }>("/api/app-lock/device/check", {});
    if (!resp.ok || !data?.success) return { trusted: false };
    return { trusted: !!data.trusted, email: data.email };
  } catch {
    return { trusted: false };
  }
}

export async function issueTrustedDevice(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { resp, data } = await post<{ success?: boolean; error?: string }>("/api/app-lock/device/issue", { email });
    return { ok: resp.ok && !!data?.success, error: data?.error || (resp.ok ? undefined : "Failed to remember device.") };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to remember device." };
  }
}

export async function listTrustedDevices(email: string): Promise<TrustedDevice[]> {
  try {
    const { resp, data } = await post<{ success?: boolean; devices?: TrustedDevice[] }>("/api/app-lock/device/list", { email });
    if (!resp.ok || !data?.success) return [];
    return data.devices || [];
  } catch {
    return [];
  }
}

export async function revokeTrustedDevice(email: string, id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { resp, data } = await post<{ success?: boolean; error?: string }>("/api/app-lock/device/revoke", { email, id });
    return { ok: resp.ok && !!data?.success, error: data?.error || (resp.ok ? undefined : "Failed to revoke device.") };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to revoke device." };
  }
}

export async function revokeAllDevices(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { resp, data } = await post<{ success?: boolean; error?: string }>("/api/app-lock/device/revoke-all", { email });
    return { ok: resp.ok && !!data?.success, error: data?.error || (resp.ok ? undefined : "Failed to revoke devices.") };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to revoke devices." };
  }
}

export function isBiometricAvailable(): Promise<boolean> {
  try {
    return (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable
      ? (window as any).PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      : Promise.resolve(false);
  } catch {
    return Promise.resolve(false);
  }
}