// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createOcrSemaphore, OcrBusyError } from '../../server/ocr-semaphore';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('createOcrSemaphore', () => {
  it('runs tasks concurrently up to the limit and no further', async () => {
    const gate = createOcrSemaphore(2, 5);
    const a = deferred<string>();
    const b = deferred<string>();
    const c = deferred<string>();

    const pa = gate.run(() => a.promise);
    const pb = gate.run(() => b.promise);
    const pc = gate.run(() => c.promise);

    expect(gate.inFlight()).toBe(2);
    expect(gate.queued()).toBe(1);

    a.resolve('a');
    await pa;
    // The freed slot is handed to the queued task, so concurrency never exceeds 2.
    expect(gate.inFlight()).toBe(2);
    expect(gate.queued()).toBe(0);

    b.resolve('b');
    c.resolve('c');
    expect(await Promise.all([pb, pc])).toEqual(['b', 'c']);
    expect(gate.inFlight()).toBe(0);
  });

  it('rejects with OcrBusyError once the queue is full', async () => {
    const gate = createOcrSemaphore(1, 1);
    const blocker = deferred<string>();
    const running = gate.run(() => blocker.promise);
    const queued = gate.run(async () => 'queued');

    await expect(gate.run(async () => 'rejected')).rejects.toBeInstanceOf(OcrBusyError);

    blocker.resolve('done');
    expect(await running).toBe('done');
    expect(await queued).toBe('queued');
  });

  it('releases the slot when a task throws, so failures cannot wedge the gate', async () => {
    const gate = createOcrSemaphore(1, 0);
    await expect(gate.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(gate.inFlight()).toBe(0);
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok');
  });
});
