import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2019',
    cssTarget: 'safari14',
  },
  server: {
    host: true,
    port: 5199,
  },
});
