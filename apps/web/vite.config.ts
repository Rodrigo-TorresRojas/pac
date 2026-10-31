import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El .env vive en la raíz del repositorio (../..).
// En desarrollo, /api se envía al servidor Node del puerto 3000.
export default defineConfig({
  plugins: [react()],
  envDir: "../..",
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
});
