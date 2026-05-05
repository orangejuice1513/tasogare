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
    // safari16 is the minimum that supports all modern JS used in this app.
    // safari13 is too old — esbuild cannot transform destructuring to that target.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari16",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
