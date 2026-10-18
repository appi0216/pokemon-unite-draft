import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const worker = `const BASE=new URL("./",self.location.href).pathname;
const PREFIX="unite-draft-"+encodeURIComponent(BASE)+"-";
const CACHE=PREFIX+"__VERSION__";
const FILES=__FILES__.map(path=>BASE+path.replace(/^\\//,""));
const assetURL=path=>new URL(path,self.location.origin).href;
async function cacheReady(){const cache=await caches.open(CACHE);const keys=new Set((await cache.keys()).map(request=>request.url));return FILES.every(path=>keys.has(assetURL(path)));}
async function status(source){let ready=false;try{ready=await cacheReady();}catch{}source?.postMessage({type:ready?'OFFLINE_READY':'OFFLINE_UNAVAILABLE'});return ready;}
async function broadcast(){for(const client of await self.clients.matchAll())await status(client);}
async function prepare(){const cache=await caches.open(CACHE);await cache.addAll(FILES.map(path=>new Request(assetURL(path),{cache:'reload'})));if(!await cacheReady())throw Error('Incomplete offline cache');}
self.addEventListener('install',event=>event.waitUntil(prepare()));
// Updates wait for all app tabs/windows to close. Never replace a live draft.
self.addEventListener('activate',event=>event.waitUntil((async()=>{if(!await cacheReady())throw Error('Incomplete offline cache');for(const key of await caches.keys()){if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);}await self.clients.claim();await broadcast();})()));
self.addEventListener('message',event=>{if(event.data?.type==='CHECK_OFFLINE')event.waitUntil(status(event.source));if(event.data?.type==='REPAIR_OFFLINE')event.waitUntil((async()=>{try{await prepare();}catch{}await status(event.source);})());});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;event.respondWith((async()=>{const cache=await caches.open(CACHE);if(event.request.mode==='navigate'){const route=url.pathname.slice(BASE.length);const page=route===''||route==='index.html'?'index.html':null;if(page){const saved=await cache.match(BASE+page,{ignoreVary:true});if(saved)return saved;}}return await cache.match(event.request,{ignoreVary:true})||fetch(event.request);})().catch(()=>new Response("Offline",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}})));});
`;

export async function createOfflineBundle(directory) {
  async function walk(folder, prefix = "") {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const name = `${prefix}/${entry.name}`;
        return entry.isDirectory()
          ? walk(path.join(folder, entry.name), name)
          : [name];
      }),
    );
    return nested.flat();
  }
  const files = (await walk(directory))
    .filter((file) => file !== "/sw.js")
    .sort();
  const hash = createHash("sha256").update(worker);
  for (const file of files) {
    hash
      .update(file)
      .update("\0")
      .update(await fs.readFile(path.join(directory, file)))
      .update("\0");
  }
  const version = hash.digest("hex").slice(0, 16);
  return {
    files,
    version,
    source: worker
      .replace("__VERSION__", version)
      .replace("__FILES__", JSON.stringify(files)),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const bundle = await createOfflineBundle("dist");
  await fs.writeFile("dist/sw.js", bundle.source);
  console.log(
    "Offline cache prepared:",
    bundle.files.length,
    "files,",
    bundle.version,
  );
}

