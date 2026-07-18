import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import packageMetadata from './package.json'

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(packageMetadata.version) },
  plugins: [react()],
})
