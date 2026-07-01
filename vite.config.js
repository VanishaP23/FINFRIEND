import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend makes every backend call to "/api/...". In development the Vite
// dev server forwards those to the FastAPI backend running on port 8000, and
// strips the "/api" prefix (so "/api/chat" -> "http://127.0.0.1:8000/chat").
// This means the browser only ever talks to one origin, so there are no CORS
// problems and nothing to configure on the day.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, "")
      }
    }
  }
});
