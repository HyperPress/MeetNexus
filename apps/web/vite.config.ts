import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiProxy = {
  target: 'http://127.0.0.1:8080',
  changeOrigin: true,
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/health': apiProxy,
      '/rooms': apiProxy,
    },
  },
})
