// @ts-nocheck
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function unityWebGLAssetMiddleware() {
  return (request: { url?: string }, response: { setHeader: (key: string, value: string) => void }, next: () => void) => {
    const requestPath = decodeURIComponent((request.url ?? "").split("?")[0]);
    const match = requestPath.match(/^\/WebGL\/Build\/(.+\.(data|framework\.js|wasm)\.br)$/);
    if (!match) {
      next();
      return;
    }

    const filename = match[1];
    const absolutePath = resolve(process.cwd(), "public", "WebGL", "Build", filename);
    if (!existsSync(absolutePath)) {
      next();
      return;
    }

    const contentType = filename.endsWith(".wasm.br") ? "application/wasm" : filename.endsWith(".framework.js.br") ? "text/javascript" : "application/octet-stream";

    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Encoding", "br");
    response.setHeader("Cache-Control", "no-store");
    createReadStream(absolutePath).pipe(response);
  };
}

export default defineConfig(({ mode }) => ({
  base: mode === "github-pages" ? "/edm-industrial-digital-twin/" : "/",
  build: {
    sourcemap: false,
  },
  plugins: [
    react(),
    {
      name: "edm-unity-webgl-brotli-assets",
      configureServer(server) {
        server.middlewares.use(unityWebGLAssetMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(unityWebGLAssetMiddleware());
      },
    },
  ],
  server: {
    headers: {
      // Disable caching for Unity WebGL assets during development
      // so a fresh build is always served without needing to force-refresh.
      "Cache-Control": "no-store",
    },
  },
}));
