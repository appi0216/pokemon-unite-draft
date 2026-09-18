import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const index = await fs.readFile("dist/index.html", "utf8");
const version = createHash("sha256").update(index).digest("hex").slice(0, 12);
const assets = await fs.readdir("dist/assets");
const pokemon = JSON.parse(
  await fs.readFile("dist/asset-manifest.json", "utf8"),
);
const files = [
  "/",
  "/index.html",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
  "/asset-manifest.json",
  ...assets.map((f) => "/assets/" + f),
  ...pokemon,
];
const sw = `const CACHE='unite-draft-${version}';
const FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys()){if(key.startsWith('unite-draft-')&&key!==CACHE)await caches.delete(key);}await self.clients.claim();for(const client of await self.clients.matchAll())client.postMessage({type:'OFFLINE_READY'});})()));
self.addEventListener('message',event=>{if(event.data?.type==='CHECK_OFFLINE')event.source?.postMessage({type:'OFFLINE_READY'});});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;event.respondWith((async()=>{const cache=await caches.open(CACHE);if(event.request.mode==='navigate'){try{const response=await fetch(event.request);if(response.ok)return response;}catch{}return await cache.match('/index.html');}return await cache.match(event.request)||fetch(event.request);})());});
`;
await fs.writeFile("dist/sw.js", sw);
console.log("Offline cache prepared:", files.length, "files,", version);
