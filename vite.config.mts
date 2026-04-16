import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    port: 5173,
    strictPort: true, // Fail if 5173 is in use (close other vite/app using it)
    open: false, // Don't open browser — use the Electron window so SSH/IPC works
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
