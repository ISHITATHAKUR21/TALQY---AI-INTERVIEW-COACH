import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: process.env.VITE_PAGES_BASE !== undefined ? "./" : "/",
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks: { charts: ["recharts"], react: ["react","react-dom","react-router-dom"] } } } },
  server: {
    proxy: { "/api": process.env.API_PROXY || "http://127.0.0.1:8000" },
  },
});
