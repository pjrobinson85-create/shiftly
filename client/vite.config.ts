import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/shiftly/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // allow LAN access (phone, tablet, etc.)
    port: 5173,
    allowedHosts: ['vikunja.ubuntu-hermes.com', '192.168.1.238'],
    hmr: {
      // Without this, @vite/client tries to open the HMR WebSocket on port 5173
      // directly from the browser. The browser is on HTTPS (port 443) and port 5173
      // is not exposed through nginx, so the connection fails — in Vite v6 this can
      // prevent React from mounting (blank page). Setting clientPort: 443 routes
      // the WebSocket through nginx instead, which already proxies /shiftly with
      // Upgrade/Connection headers for HMR support.
      clientPort: 443,
    },
    proxy: {
      '/shiftly/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/shiftly/, ''),
      },
      '/shiftly/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/shiftly/, ''),
      },
    },
  },
})
