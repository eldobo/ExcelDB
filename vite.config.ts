import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ExcelDB',
      formats: ['es', 'cjs'],
      fileName: 'exceldb',
    },
    rollupOptions: {
      external: ['@azure/msal-browser'],
    },
  },
  plugins: [dts({ include: ['src'] })],
});
