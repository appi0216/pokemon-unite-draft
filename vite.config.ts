import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const buildId = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  base: "/pokemon-unite-draft/",
  build: {
    target: "es2022",
    rollupOptions: { input: { main: "index.html" } },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});

