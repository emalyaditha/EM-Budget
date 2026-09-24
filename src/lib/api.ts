export const apiUrl = (path: string) => {
  const base = import.meta.env.VITE_API_URL || '';
  return `${base}${path}`;
};
export const safeJson = async (res: Response) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label = 'Operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 10000, onRetry } = options;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        onRetry?.(attempt + 1, lastError);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError!;
}
