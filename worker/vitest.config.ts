import { defineConfig } from 'vitest/config';

// Test files share one emulator database and clear it, so they must not run in parallel.
export default defineConfig({ test: { fileParallelism: false } });
