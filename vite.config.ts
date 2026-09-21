import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/pokemon-unite-draft/",
  build: { target: "es2022" },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
