import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Build PWA standard (da pubblicare su https).
// Su GitHub Pages: BASE_PATH=/automemo/ (impostato nel workflow). In locale: percorsi relativi.
export default defineConfig({
  base: process.env.BASE_PATH || './',
  plugins: [react(), tailwindcss()],
  define: { __SINGLE_FILE__: 'false', __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0') },
})
