export const apiUrl = (path: string) => {
  const base = (import.meta as any).env?.VITE_API_URL || "";
  return `${base}${path}`;
};
export const apiFetch = (path: string, init?: RequestInit) => fetch(apiUrl(path), init);
