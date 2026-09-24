import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'api-src/**/*.{test,spec}.{ts,tsx}'],
    // Cap workers: default (cores-1) forks OOM on this machine and silently drop test files. Do not remove.
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage',
      exclude: ['src/main.tsx', 'src/setupTests.ts', 'server.ts'],
      thresholds: {
        statements: 62.4,
        branches: 45,
        functions: 62.33,
        lines: 63.56,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
