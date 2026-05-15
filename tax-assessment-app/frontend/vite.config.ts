import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path: GitHub Pages serves at https://<user>.github.io/fivetran-sheetz-demo/
// (the GitHub repo is still named fivetran-sheetz-demo; the local project name
// is "tax-assessment-databricks-demo" but until the GitHub repo is renamed
// this MUST match the actual deployment path or every asset URL 404s).
// Override via VITE_BASE when previewing at the root.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/fivetran-sheetz-demo/',
})
