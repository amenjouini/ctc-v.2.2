import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The websocket server runs separately on 8787; Vite proxies /ws to it
    // so the browser only ever talks to one origin in development.
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true } },
  },
});
