import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/rentaltracker/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'fluent-ui': ['@fluentui/react-components', '@fluentui/react-icons'],
          'msal': ['@azure/msal-browser', '@azure/msal-react'],
          'vendor': ['react', 'react-dom', 'react-router-dom', 'zustand', 'date-fns'],
        },
      },
    },
  },
});
