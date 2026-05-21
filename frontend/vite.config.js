import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/auth': 'http://localhost:3001',
      '/api/applications': 'http://localhost:3002',
      '/uploads': 'http://localhost:3002',
    },
  },
});
