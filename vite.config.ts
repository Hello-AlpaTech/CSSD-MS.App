import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icon.svg', 'Androidnew.png', 'Iosnew.png', 'Windowsnew.png'],
      manifest: {
        name: "e-CSSD Wflow",
        short_name: "e-CSSD by. Alpatech",
        description: "Sistem manajemen sterilisasi dan pelacakan alat medis RSUD Benda untuk mendukung operasional Central Sterile Services Department secara efisien dan terintegrasi.",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        id: "id.alpatech.ecssd",
        orientation: "any",
        dir: "ltr",
        icons: [
          {
            src: "/Androidnew.png",
            type: "image/png",
            sizes: "512x512 1254x1254",
            purpose: "any"
          },
          {
            src: "/Iosnew.png",
            type: "image/png",
            sizes: "512x512 1254x1254",
            purpose: "maskable"
          },
          {
            src: "/Windowsnew.png",
            type: "image/png",
            sizes: "512x512 1254x1254",
            purpose: "any"
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MB
      }
    })
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' || warning.message.includes('use client')) {
          return;
        }
        warn(warning);
      }
    }
  }
});
