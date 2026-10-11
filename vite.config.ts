import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

function normalizeBase(input: string | undefined) {
  if (!input || input === '/') return '/'
  let base = input.trim()
  if (!base.startsWith('/')) base = `/${base}`
  if (!base.endsWith('/')) base = `${base}/`
  return base
}

// GitHub Pages project sites need a repo subpath.
// Set VITE_BASE_PATH=/repo-name/ in the shell or in .env before `npm run build`.
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const base = normalizeBase(process.env.VITE_BASE_PATH || fileEnv.VITE_BASE_PATH)

  return {
    base,
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 43123,
      strictPort: true,
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 43123,
      strictPort: true,
      allowedHosts: true,
    },
  }
})
