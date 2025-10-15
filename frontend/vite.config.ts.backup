import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [react(), svgr()],
  server: {
    port: 3000,   // so you don’t break your Cognito / Lambda callbacks
    strictPort: true,
    open: true,
  },
  define: {
    'process.env': {}, // only if you have libs that reference it
  },
});
