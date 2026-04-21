import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * vite.config.js
 * ==============
 *
 * THE ROOT CAUSE OF YOUR CORS ERROR:
 * ───────────────────────────────────
 * Your frontend runs on  http://localhost:5173
 * Your client.js calls   http://127.0.0.1:8000
 *
 * Chrome treats "localhost" and "127.0.0.1" as DIFFERENT origins.
 * So every request is cross-origin, and FastAPI's CORS middleware must
 * explicitly allow BOTH. Even when it does, Chrome sometimes still blocks
 * the preflight OPTIONS request depending on the browser security policy.
 *
 * THE PERMANENT FIX — Vite Dev Proxy:
 * ────────────────────────────────────
 * The proxy makes the browser think ALL requests go to localhost:5173.
 * Vite's Node.js server then forwards them to 127.0.0.1:8000 server-side.
 * Server-to-server calls have NO CORS restrictions — the browser never
 * sees a cross-origin request, so CORS headers are never needed in dev.
 *
 * Result:
 *   Browser:  GET http://localhost:5173/api/v1/reports   ← same origin ✅
 *   Vite:     forwards to http://127.0.0.1:8000/api/v1/reports
 *   FastAPI:  responds normally
 *
 * Your client.js VITE_API_URL must be empty or set to "" so it defaults
 * to a relative path ("") — which hits the Vite proxy automatically.
 * Set in frontend/.env:   VITE_API_URL=
 */

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      // All /api requests → FastAPI backend
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
      // Static uploaded files (images/videos served by FastAPI)
      "/uploads": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
      // WebSocket (ws.router)
      "/ws": {
        target: "ws://127.0.0.1:8000",
        ws: true,
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: false,
  },
});