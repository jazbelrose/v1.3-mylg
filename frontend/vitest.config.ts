/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['backend', 'node_modules', 'dist'], // ✅ Ignore backend tests
    // On macOS, switching to forks can help stubborn worker threads exit:
    pool: 'forks',
    // Helpful defaults:
    clearMocks: true,
    restoreMocks: true,
    // If something *still* lingers, Vitest won't wait forever:
    teardownTimeout: 5000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      recharts: path.resolve(__dirname, 'src/test/__mocks__/recharts.ts'),
    },
  },
})
