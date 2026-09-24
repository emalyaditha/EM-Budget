// vitest.setup.ts
import { vi } from 'vitest';

// Mock browser environments
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn(),
  length: 0,
  key: vi.fn(),
};

// Mock ScrollIntoView or window alerts (guard: no window in node environment)
if (typeof global.window !== 'undefined') {
  global.window.alert = vi.fn();
  global.window.scrollTo = vi.fn();
}
