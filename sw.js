const CACHE="promo-alimentaire-v8";
const ASSETS=[
  "./","./index.html","./styles.css","./src/app.js","./src/data.js","./src/domain.js",
  "./src/open-data.js","./src/stacking.js","./src/matching.js","./src/basket.js","./src/confidence.js","./src/history.js","./src/product-history.js","./src/gtin.js","./src/ingestion.js","./src/import-loader.js","./data/import/index.json","./data/import/shopmium-2026-10-07.json","./data/import/la-belle-adresse-2026-10-07.json","./data/import/coupon-network-2026-10-07.json","./manifest.webmanifest","./icon.svg"
];
self.addEventListener("install",(event)=>event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(ASSETS))));
self.addEventListener("activate",(event)=>event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((k)=>k!==CACHE).map((k)=>caches.delete(k))))));
self.addEventListener("fetch",(event)=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin){
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(fetch(event.request).then((response)=>{
    const copy=response.clone();
    caches.open(CACHE).then((cache)=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request)));
});
