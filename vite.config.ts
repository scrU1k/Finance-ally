import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    host: process.env.VITE_HOST || '127.0.0.1',
    port: 5173,
    allowedHosts: process.env.VITE_HOST ? true : undefined,
    watch: {
      ignored: ['**/android/**', '**/*.apk', '**/node_modules/**']
    }
  }
})
