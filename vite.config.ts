import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/** In development there is no server to fill in the link-preview tags
 *  (server/page.ts does it in production), so they get plain defaults. */
const devPreviewTags = {
  name: "dev-preview-tags",
  apply: "serve" as const,
  transformIndexHtml: (html: string) =>
    html
      .replaceAll("__ORIGIN__", "")
      .replaceAll("__OG_PATH__", "/")
      .replaceAll("__OG_TITLE__", "Crack the Code")
      .replaceAll("__OG_DESC__", "Crack a hidden four-digit code."),
};

export default defineConfig({
  plugins: [react(), devPreviewTags],
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
