import {canonicalGtin} from "./gtin.js";

const OFF_PRODUCT_API = "https://world.openfoodfacts.org/api/v3/product";
const OPEN_PRICES_API = "https://prices.openfoodfacts.org/api/v1/prices";

const STORE_MATCHERS = {
  carrefour: /carrefour/i,
  leclerc: /(?:e\.?\s*)?leclerc/i
};

export function normalizeBarcode(value) {
  const digits=String(value ?? "").replace(/\D/g,"");
  if(![8,12,13,14].includes(digits.length)) {
    throw new Error("Le code-barres doit contenir 8, 12, 13 ou 14 chiffres.");
  }
  return digits;
}

export async function fetchProductByBarcode(value, fetchImpl=fetch) {
  const code=normalizeBarcode(value);
  const fields=[
    "code","product_name","generic_name","brands","quantity",
    "image_front_url","nutrition_grades","categories_tags"
  ].join(",");
  const url=`${OFF_PRODUCT_API}/${encodeURIComponent(code)}?fields=${encodeURIComponent(fields)}&cc=fr&lc=fr`;
  const response=await fetchImpl(url,{headers:{Accept:"application/json"}});
  if(!response.ok) throw new Error(`Open Food Facts indisponible (${response.status}).`);
  const payload=await response.json();
  if(!payload?.product) throw new Error("Produit introuvable dans Open Food Facts.");
  const returnedCode=String(payload.product.code || code);
  const canonicalQuery=canonicalGtin(code);
  // Protect against mismatched API/cache product records: the name, photo
  // and nutritional information must describe the scanned SKU itself.
  if(canonicalQuery && canonicalGtin(returnedCode)!==canonicalQuery){
    throw new Error("Fiche Open Food Facts d'un autre code-barres : correspondance refusée.");
  }
  return {
    code:returnedCode,
    name:payload.product.product_name || payload.product.generic_name || "Produit sans nom",
    brands:payload.product.brands || "",
    quantity:payload.product.quantity || "",
    imageUrl:payload.product.image_front_url || "",
    nutriScore:payload.product.nutrition_grades || null,
    categories:payload.product.categories_tags || [],
    sourceUrl:`https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`
  };
}

export async function fetchPricesByBarcode(value,{
  store,size=100,coords=null,radiusKm=25,fetchImpl=fetch,
  maxPages=2,minimumMatches=4,signal=null
}={}) {
  const code=normalizeBarcode(value);
  const canonicalQuery=canonicalGtin(code);
  const pageSize=Math.min(Math.max(Math.trunc(Number(size)||100),1),100);
  const pageLimit=Math.min(Math.max(Math.trunc(Number(maxPages)||2),1),3);
  const minMatches=Math.min(Math.max(Math.trunc(Number(minimumMatches)||4),1),20);
  const params=new URLSearchParams({
    product_code:code,
    currency:"EUR",
    type:"PRODUCT",
    order_by:"-date",
    size:String(pageSize)
  });
  let requestedRadius=null;
  if(coords){
    const rawLat=coords.latitude ?? coords.lat;
    const rawLon=coords.longitude ?? coords.lon;
    const lat=Number(rawLat);
    const lon=Number(rawLon);
    if(rawLat===null || rawLat===undefined || rawLat===""
      || rawLon===null || rawLon===undefined || rawLon===""
      || !Number.isFinite(lat) || lat < -90 || lat > 90
      || !Number.isFinite(lon) || lon < -180 || lon > 180){
      throw new Error("Coordonnées géographiques invalides.");
    }
    const radius=Math.min(Math.max(Number(radiusKm)||25,1),100);
    requestedRadius=radius;
    params.set("lat",String(lat));
    params.set("lon",String(lon));
    params.set("radius_km",String(radius));
  }

  const url=`${OPEN_PRICES_API}?${params}`;
  const all=[];
  const seen=new Set();
  let pagesFetched=0;
  let total=null;
  let partial=false;
  let moreAvailable=false;
  let recentUsableMatches=0;

  for(let page=1;page<=pageLimit;page++){
    if(signal?.aborted) {
      throw new DOMException("Recherche annulée","AbortError");
    }
    // Page 1 omits the page query for backwards compatibility with callers.
    const pageParams=new URLSearchParams(params);
    if(page>1) pageParams.set("page",String(page));
    const pageUrl=`${OPEN_PRICES_API}?${pageParams}`;
    let payload;
    try{
      const response=await fetchImpl(pageUrl,{
        headers:{Accept:"application/json"},signal
      });
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      payload=await response.json();
      if(!payload || !Array.isArray(payload.items)){
        throw new Error("Réponse Open Prices invalide");
      }
    }catch(error){
      // An obsolete search must stop immediately, including after page 1.
      // It is not a provider outage and must never be reported as partial.
      if(signal?.aborted) throw error;
      if(page===1) throw new Error(`Open Prices indisponible (${error.message}).`);
      partial=true;
      break;
    }

    pagesFetched+=1;
    if(Number.isInteger(payload.total) && payload.total>=0) total=payload.total;
    const items=payload.items;
    for(const source of items){
      const observation=normalizePriceObservation(source,coords);
      const observedCode=String(observation.productCode);
      if(canonicalQuery ? canonicalGtin(observedCode)!==canonicalQuery : observedCode!==code) continue;
      if(observation.currency!=="EUR") continue;
      if(observation.pricePer!=="UNIT") continue;
      if(!Number.isFinite(observation.price) || observation.price<=0) continue;
      if(!isUnambiguousRetailer(observation.retailerText,store)) continue;
      // Server-side radius filtering alone is not sufficient evidence.
      if(requestedRadius!==null &&
        (!Number.isFinite(observation.distanceKm)
          || observation.distanceKm>requestedRadius+0.1)) continue;
      const key=observation.id!==null && observation.id!==undefined
        ? "id:"+String(observation.id)
        : JSON.stringify([
            observation.productCode,observation.locationId,
            observation.storeName,observation.postcode,observation.city,
            observation.locationLat,observation.locationLon,
            observation.date,observation.price,observation.pricePer
          ]);
      if(seen.has(key)) continue;
      seen.add(key);
      all.push(observation);
      // Undated, stale or future-dated records must not exhaust the
      // search budget: only truly recent receipts satisfy the target count.
      if(isFreshObservation(observation,30)) recentUsableMatches+=1;
    }

    const declaredPages=Number(payload.pages);
    const hasMore=Number.isInteger(declaredPages) && declaredPages>=1
      ? page<declaredPages
      : total!==null
        ? page*pageSize<total
        : items.length>=pageSize;
    // Even a successful response is NOT an exhaustive search if we stopped
    // at the request limit or after finding enough matches. This distinction
    // is crucial when saying that no EAN price was found for an enseigne.
    moreAvailable=hasMore && items.length>0;
    if(page>=pageLimit || recentUsableMatches>=minMatches || items.length===0) break;
    if(!moreAvailable) break;
    // Short pages without explicit page count cannot safely imply that
    // another page exists, even if the reported total is inconsistent.
    if(!Number.isInteger(declaredPages) && items.length<pageSize) {
      moreAvailable=false;
      break;
    }
  }

  const observations=all.sort((a,b)=>{
    if(coords){
      const da=Number.isFinite(a.distanceKm) ? a.distanceKm : Infinity;
      const db=Number.isFinite(b.distanceKm) ? b.distanceKm : Infinity;
      if(da!==db) return da-db;
    }
    return new Date(b.date)-new Date(a.date);
  });
  return {
    observations,total:total ?? observations.length,sourceUrl:url,
    pagesFetched,partial,moreAvailable,
    searchIncomplete:partial || moreAvailable
  };
}

export function isUnambiguousRetailer(retailerText,store){
  const label=String(retailerText || "");
  const wanted=STORE_MATCHERS[store];
  if(!wanted) return Boolean(label.trim());
  if(!wanted.test(label)) return false;
  for(const [otherStore,pattern] of Object.entries(STORE_MATCHERS)){
    if(otherStore!==store && pattern.test(label)) return false;
  }
  return true;
}

export function normalizePriceObservation(item,originCoords=null) {
  const location=item?.location || {};
  const retailerText=[
    location.osm_brand,location.osm_name,location.osm_display_name,location.osm_tag_value
  ].filter(Boolean).join(" · ");
  const latPresent=location.osm_lat!==null && location.osm_lat!==undefined && location.osm_lat!=="";
  const lonPresent=location.osm_lon!==null && location.osm_lon!==undefined && location.osm_lon!=="";
  const locationLat=latPresent ? Number(location.osm_lat) : NaN;
  const locationLon=lonPresent ? Number(location.osm_lon) : NaN;
  const hasLocation=latPresent && lonPresent
    && Number.isFinite(locationLat) && locationLat>=-90 && locationLat<=90
    && Number.isFinite(locationLon) && locationLon>=-180 && locationLon<=180;
  const distanceKm=originCoords && hasLocation
    ? haversineKm(
        Number(originCoords.latitude ?? originCoords.lat),
        Number(originCoords.longitude ?? originCoords.lon),
        locationLat,
        locationLon
      )
    : null;
  return {
    id:item.id,
    locationId:item.location_id || location.id || null,
    locationLat:hasLocation ? locationLat : null,
    locationLon:hasLocation ? locationLon : null,
    distanceKm:Number.isFinite(distanceKm) ? Math.round(distanceKm*10)/10 : null,
    productCode:item.product_code || item?.product?.code || "",
    productName:item.product_name || item?.product?.product_name || "",
    price:Number(item.price),
    pricePer:String(item.price_per || "UNIT").toUpperCase(),
    currency:item.currency || "EUR",
    isDiscounted:item.price_is_discounted===true
      || item.price_is_discounted===1
      || (item.price_without_discount!==null
        && item.price_without_discount!==undefined
        && item.price_without_discount!==""
        && Number.isFinite(Number(item.price))
        && Number.isFinite(Number(item.price_without_discount))
        && Number(item.price_without_discount)>Number(item.price)),
    priceWithoutDiscount:item.price_without_discount!==null
      && item.price_without_discount!==undefined
      && item.price_without_discount!==""
      && Number.isFinite(Number(item.price_without_discount))
      && Number(item.price_without_discount)>0
      ? Number(item.price_without_discount) : null,
    discountType:item.discount_type || null,
    // updated/created are metadata timestamps, not proof of a shelf or
    // checkout price observation. Never invent a receipt date from them.
    date:item.date || null,
    retailerText,
    storeName:location.osm_name || location.osm_brand || "Magasin non précisé",
    city:location.osm_address_city || "",
    postcode:location.osm_address_postcode || "",
    proofType:item?.proof?.type || null
  };
}

export function isFreshObservation(observation,maxAgeDays=120,now=new Date()) {
  if(!observation?.date) return false;
  const date=new Date(observation.date);
  if(Number.isNaN(date.getTime())) return false;
  const ageMs=now-date;
  return ageMs >= 0 && ageMs <= maxAgeDays*24*60*60*1000;
}


export function haversineKm(lat1,lon1,lat2,lon2) {
  const raw=[lat1,lon1,lat2,lon2];
  if(raw.some((value)=>value===null || value===undefined || value==="")) return null;
  const values=raw.map(Number);
  if(values.some((value)=>!Number.isFinite(value))) return null;
  if(Math.abs(values[0])>90 || Math.abs(values[2])>90
    || Math.abs(values[1])>180 || Math.abs(values[3])>180) return null;
  const [aLat,aLon,bLat,bLon]=values;
  const toRad=(degrees)=>degrees*Math.PI/180;
  const dLat=toRad(bLat-aLat);
  const dLon=toRad(bLon-aLon);
  const a=Math.sin(dLat/2)**2
    + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}


export function observationAgeDays(observation,now=new Date()) {
  if(!observation?.date) return null;
  const date=new Date(observation.date);
  if(Number.isNaN(date.getTime())) return null;
  const ageMs=now-date;
  if(ageMs<0) return null;
  return Math.floor(ageMs/(24*60*60*1000));
}

export function priceFreshness(observation,now=new Date()) {
  const ageDays=observationAgeDays(observation,now);
  if(ageDays===null) return {level:"unknown",label:"date inconnue",ageDays:null};
  if(ageDays<=7) return {level:"very-recent",label:"≤ 7 jours",ageDays};
  if(ageDays<=30) return {level:"recent",label:"≤ 30 jours",ageDays};
  if(ageDays<=120) return {level:"old",label:"31–120 jours",ageDays};
  return {level:"stale",label:"> 120 jours",ageDays};
}

export function selectBestRecentPrice(observations,maxAgeDays=120,now=new Date(),preferredAgeDays=30) {
  const candidates=(observations || [])
    .filter((item)=>Number.isFinite(Number(item.price)) && Number(item.price)>0)
    .filter((item)=>isFreshObservation(item,maxAgeDays,now));
  if(!candidates.length) return null;

  // A low price observed weeks ago is NOT today's price. Always choose the
  // latest observation day first, even if the newer price is higher.
  // If reports conflict on the same date, use the higher observed price:
  // an advertised discount must not depend on the most optimistic receipt.
  const ordered=[...candidates].sort((a,b)=>{
    const dayA=new Date(a.date).toISOString().slice(0,10);
    const dayB=new Date(b.date).toISOString().slice(0,10);
    if(dayA!==dayB) return dayA<dayB ? 1 : -1;
    const priceDiff=Number(b.price)-Number(a.price);
    if(priceDiff!==0) return priceDiff;
    // Prefer a receipt with a declared proof if prices and dates agree.
    if(Boolean(a.proofType)!==Boolean(b.proofType)) return a.proofType ? -1 : 1;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  return ordered[0];
}
