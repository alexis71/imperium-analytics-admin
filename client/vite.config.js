import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
    },
  },
  // Forge extensions (file: protocol) tienen peer deps · dedupe fuerza una sola copia
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
