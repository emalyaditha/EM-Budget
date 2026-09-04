export const apiUrl = (path: string) => {
  const base = (import.meta as any).env?.VITE_API_URL || "";
  return `${base}${path}`;
};
export const safeJson = async (res: Response) => {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
};

const DEFAULT_FETCH_TIMEOUT = 8000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label = 'Operation',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export const apiFetch = async (path: string, init?: RequestInit) => {
  const res = await fetchWithTimeout(apiUrl(path), init);
  return res;
};