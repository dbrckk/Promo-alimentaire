const CACHE_PREFIX="promo-alimentaire-";
const CACHE=CACHE_PREFIX+"v36";
const STATIC_ASSETS=[
  "./","./index.html","./styles.css","./src/app.js","./src/data.js","./src/source-discovery.js","./src/domain.js","./src/offer-simulator.js",
  "./src/open-data.js","./src/manual-prices.js","./src/promo-price-check.js","./src/stacking.js","./src/matching.js","./src/exact-sku-comparison.js","./src/retailer-promo.js","./src/bundle.js","./src/basket.js","./src/budget.js","./src/shopping-list-transfer.js",
  "./src/confidence.js","./src/history.js","./src/action-plan.js","./src/verification-queue.js","./src/strategy.js","./src/loyalty.js","./src/evidence.js","./src/local-verification.js","./src/product-history.js","./src/gtin.js",
  "./src/ingestion.js","./src/retailer-ean-evidence.js","./src/import-loader.js","./data/import/index.json","./data/import/source-sync-status.json","./data/import/source-sync-carrefour.json","./data/import/source-sync-leclerc.json",
  "./data/import/payment-discounts-auto.json","./manifest.webmanifest","./icon.svg"
];

self.addEventListener("install",(event)=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(STATIC_ASSETS);
    try{
      const response=await fetch("./data/import/index.json",{cache:"no-store"});
      if(!response.ok) return;
      const manifest=await response.json();
      const files=Array.isArray(manifest?.files) ? manifest.files : [];
      await Promise.allSettled(files.map((file)=>
        cache.add("./data/import/"+encodeURIComponent(file).replace(/%2F/gi,"/"))
      ));
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
      // Do not overwrite a valid offline asset with HTTP 404/500.
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(
          caches.open(CACHE)
            .then((cache)=>cache.put(event.request,copy))
            .catch(()=>{})
        );
      }
      return response;
    }catch{
      return (await caches.match(event.request)) || Response.error();
    }
  })());
});
