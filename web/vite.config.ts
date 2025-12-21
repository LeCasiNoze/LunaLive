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

      // tu peux laisser auto, MAIS comme tu registers aussi à la main,
      // je te conseille de couper l'auto-register :
      injectRegister: null,
      registerType: "autoUpdate",

      includeAssets: ["favicon.png", "logo.png", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "LunaLive",
        short_name: "LunaLive",
        description: "Live casino streaming platform (MVP)",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#1D1125",
        theme_color: "#1D1125",
        orientation: "portrait",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  server: {
    port: 5175,
    strictPort: true,
  },
});
