import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_URL ?? '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
  },
})
