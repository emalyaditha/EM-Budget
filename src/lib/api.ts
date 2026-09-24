export const apiUrl = (path: string) => {
  const base = (import.meta as any).env?.VITE_API_URL || "";
  return `${base}${path}`;
};
export const safeJson = async (res: Response) => {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
};
export const apiFetch = async (path: string, init?: RequestInit) => {
  const res = await fetch(apiUrl(path), init);
  return res;
};

export const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit & { timeout?: number }) => {
  const { timeout = 10000, ...rest } = init || {};
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(input, { ...rest, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
};