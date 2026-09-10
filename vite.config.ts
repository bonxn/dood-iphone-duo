import { defineConfig } from 'vite'

// GitHub Pages serves the site under /<repo>/; the Pages workflow sets BASE_PATH accordingly.
// Local dev and other hosts keep '/'.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
})
