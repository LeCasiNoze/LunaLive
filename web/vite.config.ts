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

      // tu registers à la main -> pas d'auto inject
      injectRegister: null,
      registerType: "autoUpdate",

      // Assets copiés tels quels dans le build (doivent exister dans /public)
      // ⚠️ Mets bien ces fichiers dans web/public/pwa/
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
  server: {
    port: 5175,
    strictPort: true,
  },
});
