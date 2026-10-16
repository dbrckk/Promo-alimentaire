const CACHE_PREFIX="promo-alimentaire-";
const CACHE=CACHE_PREFIX+"v139";
const STATIC_ASSETS=[
  "./","./index.html","./styles.css","./src/app.js","./src/data.js","./src/source-discovery.js","./src/daily-catalogue.js","./src/community-deals.js","./data/daily-campaigns.json","./src/domain.js","./src/offer-simulator.js",
  "./src/open-data.js","./src/manual-prices.js","./src/promo-price-check.js","./src/stacking.js","./src/matching.js","./src/exact-sku-comparison.js","./src/retailer-promo.js","./src/bundle.js","./src/basket.js","./src/budget.js","./src/shopping-list-transfer.js",
  "./src/confidence.js","./src/history.js","./src/action-plan.js","./src/verification-queue.js","./src/strategy.js","./src/loyalty.js","./src/evidence.js","./src/local-verification.js","./src/product-history.js","./src/gtin.js",
  "./src/ingestion.js","./src/retailer-ean-evidence.js","./src/import-loader.js","./src/import-manifest.js","./data/import/index.json","./data/import/source-sync-status.json","./data/import/source-sync-carrefour.json","./data/import/source-sync-leclerc.json","./data/import/source-sync-shopmium.json",
  "./data/import/payment-discounts-auto.json","./manifest.webmanifest","./icon.svg"
];


// Do not allow arbitrary successful same-origin requests to fill the
// device's offline storage. The install manifest is the only source of
// additional offer JSON filenames; query variants are never persisted.
const SCOPE_URL=new URL(self.registration.scope);
const CORE_PATHS=new Set(STATIC_ASSETS.map((path)=>new URL(path,SCOPE_URL).pathname));
const OFFER_DIRECTORY=new URL("./data/import/",SCOPE_URL).pathname;
const IMPORT_MANIFEST_URL=new URL("./data/import/index.json",SCOPE_URL).href;
function validOfferFiles(files){
  const safe=(file)=>typeof file==="string"
    && /^[a-z0-9][a-z0-9-]{0,99}\.json$/.test(file)
    && file!=="index.json" && !file.startsWith("source-sync-");
  return Array.isArray(files) && files.length<=60
    && files.every(safe) && new Set(files).size===files.length;
}
async function isAllowedCacheRequest(url){
  if(url.search || url.hash) return false;
  if(CORE_PATHS.has(url.pathname)) return true;
  if(!url.pathname.startsWith(OFFER_DIRECTORY)) return false;
  const file=url.pathname.slice(OFFER_DIRECTORY.length);
  // A file not explicitly listed in the cached manifest is not an
  // application resource, even if the server returns HTTP 200.
  const cached=await (await caches.open(CACHE)).match(IMPORT_MANIFEST_URL);
  if(!cached) return false;
  try{
    const manifest=await cached.json();
    return validOfferFiles(manifest?.files) && manifest.files.includes(file);
  }catch{return false;}
}

self.addEventListener("install",(event)=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(STATIC_ASSETS);
    try{
      const response=await fetch("./data/import/index.json",{cache:"no-store"});
      if(!response.ok) return;
      const manifest=await response.json();
      const files=manifest?.files;
      // Invalid metadata must not turn an install into arbitrary URL fetches.
      if(validOfferFiles(files)){
        await Promise.allSettled(files.map((file)=>
          cache.add("./data/import/"+file)
        ));
      }
    }catch{
      // L'application reste installable même si une source distante est temporairement indisponible.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",(event)=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys
      .filter((key)=>key.startsWith(CACHE_PREFIX) && key!==CACHE)
      .map((key)=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",(event)=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  // External APIs are not PWA assets. Let the browser manage their requests
  // so CORS, interception and online/offline errors behave normally.
  if(url.origin!==self.location.origin) return;

  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request);
      // Successful responses outside the explicit PWA asset list must
      // never consume persistent device storage.
      if(response.ok){
        // Clone before awaiting async manifest lookup: the browser may start
        // consuming the original body while the cache decision runs.
        const offlineCopy=response.clone();
        event.waitUntil((async()=>{
          if(!await isAllowedCacheRequest(url)) return;
          // An HTML error page returned with HTTP 200 must never replace a
          // valid offline offer manifest.
          if(url.href===IMPORT_MANIFEST_URL){
            let manifest;
            try{manifest=await offlineCopy.clone().json();}
            catch{return;}
            if(!validOfferFiles(manifest?.files)) return;
          }
          const cache=await caches.open(CACHE);
          await cache.put(event.request,offlineCopy);
        })().catch(()=>{}));
      }
      return response;
    }catch{
      // A navigation with harmless query parameters should still open the
      // saved application shell when the device is offline.
      return (await caches.match(event.request))
        || (event.request.mode==="navigate"
          ? await caches.match(new URL("./index.html",SCOPE_URL)) : null)
        || Response.error();
    }
  })());
});
