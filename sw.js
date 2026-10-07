const CACHE="promo-alimentaire-v13";
const STATIC_ASSETS=[
  "./","./index.html","./styles.css","./src/app.js","./src/data.js","./src/domain.js",
  "./src/open-data.js","./src/stacking.js","./src/matching.js","./src/bundle.js","./src/basket.js",
  "./src/confidence.js","./src/history.js","./src/action-plan.js","./src/strategy.js","./src/loyalty.js","./src/product-history.js","./src/gtin.js",
  "./src/ingestion.js","./src/import-loader.js","./data/import/index.json",
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
  })());
});

self.addEventListener("activate",(event)=>{
  event.waitUntil(caches.keys().then((keys)=>
    Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key)))
  ));
});

self.addEventListener("fetch",(event)=>{
  if(event.request.method!=="GET") return;
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
