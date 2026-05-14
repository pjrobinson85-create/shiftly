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
    allowedHosts: ['vikunja.ubuntu-hermes.com'],
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
