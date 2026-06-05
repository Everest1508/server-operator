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
    port: Number(process.env.PORT || 5173),
    strictPort: true, // Fail if the selected port is in use
    open: false, // Don't open browser — use the Electron window so SSH/IPC works
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/monaco-editor')) return 'monaco';
          if (id.includes('node_modules/@xterm')) return 'xterm';
          if (id.includes('node_modules/lucide-react')) return 'icons';
          return undefined;
        },
      },
    },
  },
});
