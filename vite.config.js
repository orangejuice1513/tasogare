import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Must match tauri.conf.json → build.devUrl
  server: {
    port: 1420,
    strictPort: true,
  },

  envPrefix: ["VITE_", "TAURI_ENV_"],

  build: {
    // Tauri on Apple Silicon targets Safari 13+ WebKit
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
