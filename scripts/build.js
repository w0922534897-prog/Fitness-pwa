import {
  mkdir,
  readdir,
  copyFile,
  readFile,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
export async function build() {
  const files = [
    "index.html",
    "legacy.html",
    "icon.svg",
    "style.css",
    "manifest.webmanifest",
    ...(await readdir("app"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => "app/" + f),
  ];
  await mkdir("dist/app", { recursive: true });
  for (const f of files) await copyFile(f, "dist/" + f);
  for (const n of [180, 192, 512]) {
    const f = "icon-" + n + ".png";
    await writeFile("dist/" + f, icon(n));
    files.push(f);
  }
  const hash = createHash("sha256");
  for (const f of files) hash.update(await readFile("dist/" + f));
  const sw = `const root=self.registration.scope,prefix='fitflow:'+root+':',cacheName=prefix+'${hash.digest("hex").slice(0, 16)}';
const files=${JSON.stringify(files)}.map(f=>new URL(f,root).href);
self.addEventListener('install',ev=>ev.waitUntil(caches.open(cacheName).then(c=>c.addAll(files.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',ev=>ev.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith(prefix)&&k!==cacheName)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',ev=>{if(ev.request.method!=='GET'||!ev.request.url.startsWith(root))return;const path=new URL(ev.request.url);path.search='';const url=ev.request.mode==='navigate'&&!files.includes(path.href)?new URL('index.html',root).href:path.href;if(!files.includes(url))return;ev.respondWith(caches.open(cacheName).then(async c=>(await c.match(url))||fetch(ev.request)))});
`;
  await writeFile("dist/sw.js", sw);
  await writeFile("dist/.nojekyll", "");
  console.log("FitFlow build: " + files.length + " offline assets");
}
function chunk(type, data) {
  const raw = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const b of raw) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4),
    end = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  end.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, raw, end]);
}
function icon(n) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(n);
  header.writeUInt32BE(n, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(n * (3 * n + 1));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const u = x / n - 0.5,
        v = y / n - 0.5,
        a = (u + v) * 0.707,
        b = (v - u) * 0.707;
      const on =
        Math.abs(a) < 0.245 &&
        (Math.abs(b) < 0.037 || (Math.abs(a) > 0.135 && Math.abs(b) < 0.115));
      const i = y * (3 * n + 1) + 1 + 3 * x;
      pixels.set(on ? [209, 245, 163] : [21, 63, 52], i);
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/build.js")) await build();
