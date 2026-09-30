/**
 * Bounded-concurrency gate for OCR work.
 *
 * Each Tesseract worker is a separate thread holding a ~10MB language model,
 * and the free-scan endpoint is reachable by any authenticated user. Without a
 * gate, a handful of concurrent uploads allocates a worker each and takes the
 * whole serverless instance down on memory exhaustion. This caps how many
 * recognitions run at once and how many may wait their turn, so excess traffic
 * is shed with a retryable 503 instead of an outage.
 */

export class OcrBusyError extends Error {
  constructor() {
    super('OCR concurrency limit reached');
    this.name = 'OcrBusyError';
  }
}

export interface OcrSemaphore {
  /** Run `task` with a slot reserved. Rejects with OcrBusyError when saturated. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Slots currently executing. */
  inFlight(): number;
  /** Tasks waiting for a slot. */
  queued(): number;
}

export function createOcrSemaphore(maxConcurrent: number, maxQueued: number): OcrSemaphore {
  let active = 0;
  const waiters: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < maxConcurrent) {
      active += 1;
      return Promise.resolve();
    }
    if (waiters.length >= maxQueued) {
      return Promise.reject(new OcrBusyError());
    }
    return new Promise<void>((resolve) => {
      waiters.push(() => {
        active += 1;
        resolve();
      });
    });
  };

  const release = (): void => {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    inFlight: () => active,
    queued: () => waiters.length,
  };
}
