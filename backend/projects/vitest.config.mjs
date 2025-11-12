/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '/opt/nodejs/utils/cors.mjs': './src/cors.mjs',
    },
  },
});