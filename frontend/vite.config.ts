import { defineConfig, loadEnv } from "vite";
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'path'

// dev
const devCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' *.amazonaws.com *.amplify.aws",
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  "font-src 'self' data: fonts.gstatic.com",
  "img-src 'self' data: blob: *.amazonaws.com *.cloudfront.net https://tiles.stadiamaps.com https://www.google.com https://icons.duckduckgo.com",
  "media-src 'self' https: blob:",
  // ⬇️ allow LAN fetch + HMR over WS on 3000 (and any port if you change later) + ws/wss for Yjs
  "connect-src 'self' http://localhost:* ws://localhost:* http://192.168.1.200:* ws://192.168.1.200:* https://*.amazonaws.com https://*.amplify.aws wss://*.amazonaws.com https://*.cloudfront.net https://nominatim.openstreetmap.org data: blob: ws: wss:",
  "frame-src 'self' blob:",
  "frame-ancestors 'none'",
].join('; ')

// prod (unchanged for LAN; keep locked down)
const prodCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' *.amazonaws.com *.amplify.aws",
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  "font-src 'self' data: fonts.gstatic.com",
  "img-src 'self' data: https://d1cazymewvlm0k.cloudfront.net https://d2qb21tb4meex0.cloudfront.net *.amazonaws.com https://tiles.stadiamaps.com https://www.google.com https://icons.duckduckgo.com",
  "media-src 'self' https://d1cazymewvlm0k.cloudfront.net https://d2qb21tb4meex0.cloudfront.net *.amazonaws.com",
  "connect-src 'self' https://*.amazonaws.com https://*.amplify.aws wss://*.amazonaws.com https://*.cloudfront.net https://nominatim.openstreetmap.org ws: wss:",
  "frame-ancestors 'none'",
].join('; ')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isHttps = false; // Vite dev is usually http
  const scheme = isHttps ? "wss" : "ws";

  const yjsTarget =
    (env.VITE_YJS_WS_URL && env.VITE_YJS_WS_URL.trim()) ||
    `${scheme}://35.165.113.63:1234`;

  const isDev = mode === 'development';

  const securityHeaders = {
    'Content-Security-Policy': isDev ? devCsp : prodCsp,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  }

  return {
    plugins: [react(), svgr()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    define: { ...(isDev && { 'process.env': {} }) },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            aws: ['aws-amplify'],
            ui: ['antd'],
          },
        },
      },
      minify: 'terser',
      terserOptions: { compress: { drop_console: true, drop_debugger: true } },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'aws-amplify'],
      exclude: ['@lexical/react', 'lexical'],
    },
    envPrefix: 'VITE_',

    server: {
      host: true,          // ⬅️ bind to 0.0.0.0 so LAN can reach it
        port: 5173,
      strictPort: true,
      open: true,
      headers: securityHeaders,
      hmr: {
        host: '192.168.1.200',  // ⬅️ your LAN IP
          port: 5173,
        protocol: 'ws',
      },
      proxy: {
        "/yjs": {
          target: yjsTarget,
          ws: true,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/yjs/, ""), // so final path is "/<room>"
        },
      },

      allowedHosts: [
    '.ngrok-free.app', // allow any ngrok tunnel
  ],
    },

    preview: { headers: securityHeaders },
  }
})
