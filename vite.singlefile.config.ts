import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** Rimuove i riferimenti a file esterni (manifest, icone) non disponibili nel file unico. */
function stripExternalLinks(): Plugin {
  return {
    name: 'strip-external-links',
    transformIndexHtml(html) {
      return html
        .replace(/<link rel="manifest"[^>]*>\s*/g, '')
        .replace(/<link rel="apple-touch-icon"[^>]*>\s*/g, '')
        .replace(/<link rel="icon"[^>]*>/, '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2218%22 fill=%22%230A1430%22/%3E%3Cpath d=%22M26 30l4 3.5 8-7%22 stroke=%22%234DA8FF%22 stroke-width=%224%22 fill=%22none%22/%3E%3C/svg%3E" />')
    },
  }
}

// File HTML unico e autonomo: si apre direttamente da telefono o computer (file://), senza service worker.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), stripExternalLinks(), viteSingleFile()],
  define: { __SINGLE_FILE__: 'true', __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0') },
  publicDir: false,
  build: { outDir: 'dist-single', emptyOutDir: true },
})
