import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",

      // ✅ FIX: autoriser le precache > 2MiB (ton bundle fait ~2.37MB)
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
      },

      // tu registers à la main -> pas d'auto inject
      injectRegister: null,
      registerType: "autoUpdate",

      includeAssets: [
        "favicon.png",
        "logo.png",
        "pwa/apple-touch-icon.png",
        "pwa/icon-192.png",
        "pwa/icon-512.png",
      ],

      manifest: {
        name: "LunaLive",
        short_name: "LunaLive",
        description: "Plateforme française de streaming casino en direct — lives, casinos évalués et communauté.",
        lang: "fr",
        start_url: "/?source=a2hs",
        scope: "/",
        display: "standalone",
        background_color: "#0a0a0e",
        theme_color: "#7c4dff",
        icons: [
          {
            src: "/pwa/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/pwa/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Ensure proper encoding in HTML files
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'index.html') {
            return 'index.html';
          }
          return assetInfo.name || 'asset/[name].[ext]';
        }
      }
    }
  },
  server: {
    port: 5175,
    strictPort: true,
  },
});
