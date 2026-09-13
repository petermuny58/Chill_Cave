import vike from "vike/plugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [vike(), react()],
  server: {
    cors: true,
    allowedHosts: true,
    proxy: {
      "/anilist-api": {
        target: "https://graphql.anilist.co",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/anilist-api/, ""),
      },
      "/anikoto-api": {
        target: "https://anikotoapi.site",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/anikoto-api/, ""),
      },
      "/anikoto-search-api": {
        target: "https://anikototvapi.vercel.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/anikoto-search-api/, ""),
      },
    },
  },
});