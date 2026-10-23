import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// В разработке запросы к данным уходят на Python-сервер (server.py).
const backend = process.env.BACKEND_URL ?? 'http://localhost:8765'

export default defineConfig(({ mode }) => ({
  // Для GitHub Pages сайт лежит в подпапке репозитория — пути делаем относительными.
  base: mode === 'static' ? './' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/photos': backend,
    },
  },
  build: {
    target: 'es2022',
    outDir: mode === 'static' ? 'dist-static' : 'dist',
    chunkSizeWarningLimit: 1200,
  },
}))
