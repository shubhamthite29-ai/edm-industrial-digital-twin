import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 5173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveAsset(url) {
  const cleanUrl = decodeURIComponent((url || "/").split("?")[0]);
  const safePath = normalize(cleanUrl).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = resolve(join(root, safePath));

  if (!absolutePath.startsWith(root)) return join(root, "index.html");
  if (existsSync(absolutePath) && statSync(absolutePath).isFile()) return absolutePath;
  return join(root, "index.html");
}

const server = createServer((request, response) => {
  const assetPath = resolveAsset(request.url);
  const extension = extname(assetPath);

  response.setHeader("Content-Type", mimeTypes[extension] || "application/octet-stream");
  response.setHeader("Cache-Control", extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable");

  createReadStream(assetPath)
    .on("error", () => {
      response.statusCode = 500;
      response.end("Static server error");
    })
    .pipe(response);
});

server.listen(port, host, () => {
  console.log(`EDM Digital Twin static server listening on http://${host}:${port}`);
});
