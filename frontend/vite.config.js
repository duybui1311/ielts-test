import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Force a single copy of these packages. MUI pulls in @emotion transitively;
  // without deduping, dev/prod can load two @emotion/react instances and warn
  // "loading @emotion/react when it is already loaded".
  resolve: {
    dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled', '@mui/material'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8000',
      // Legacy local media (e.g. seeded listening audio) served by the backend.
      '/uploads': 'http://localhost:8000',
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split heavy, stable vendor libraries into their own long-cached
        // chunks so the per-route app code stays small.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mui': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'vendor-charts': ['recharts'],
          'vendor-motion': ['framer-motion'],
        },
      },
    },
  },
})
