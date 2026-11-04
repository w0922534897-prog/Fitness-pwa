import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { build } from "./build.js";
export function serve(port = 4173, base = "/") {
  const root = resolve("dist");
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith(base)) throw Error();
      const f = resolve(
        root,
        decodeURIComponent(url.pathname.slice(base.length)) || "index.html",
      );
      if (!f.startsWith(root + sep)) throw Error();
      const data = await readFile(f);
      res.writeHead(200, {
        "Content-Type":
          {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css",
            ".webmanifest": "application/manifest+json",
            ".png": "image/png",
          }[extname(f)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("404");
    }
  }).listen(port, "127.0.0.1");
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/serve.js")) {
  await build();
  serve();
  console.log("http://127.0.0.1:4173/");
}
