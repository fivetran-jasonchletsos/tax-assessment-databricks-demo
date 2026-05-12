import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path: GitHub Pages serves at https://<user>.github.io/fivetran-sheetz-demo/
// Override via VITE_BASE when previewing at the root.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/fivetran-sheetz-demo/',
})
