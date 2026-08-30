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