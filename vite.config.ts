import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const API_PORT = process.env.API_PORT ?? '3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3000,
    hmr: process.env.DISABLE_HMR !== 'true',
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
