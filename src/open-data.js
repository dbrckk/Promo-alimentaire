import {canonicalGtin} from "./gtin.js";

const OFF_PRODUCT_API = "https://world.openfoodfacts.org/api/v3/product";
const OPEN_PRICES_API = "https://prices.openfoodfacts.org/api/v1/prices";

/**
 * Only a real positive Open Prices record ID may produce a public source link.
 * Never trust a provider-supplied full URL or render arbitrary string IDs as hrefs.
 */
export function priceObservationPublicUrl(id) {
  const digits=String(id??"");
  if(!/^[1-9]\d{0,15}$/.test(digits) || !Number.isSafeInteger(Number(digits))){
    return null;
  }
  return `https://prices.openfoodfacts.org/prices/${digits}`;
}


/**
 * A public map marker for the store coordinates supplied by Open Prices.
 * Never build a URL from a shop name, user GPS, postcode centroid or
 * provider-supplied URL. The (0,0) placeholder is not a reliable outlet.
 * This marker describes a contributed location, NOT live stock or prices.
 */
export function priceOutletMapUrl(observation){
  const lat=observation?.locationLat,lon=observation?.locationLon;
  if(typeof lat!=="number" || typeof lon!=="number"
    || !Number.isFinite(lat) || !Number.isFinite(lon)
    || lat < -90 || lat > 90 || lon < -180 || lon > 180
    || (lat===0 && lon===0)) return null;
  const markerLat=lat.toFixed(5),markerLon=lon.toFixed(5);
  return "https://www.openstreetmap.org/?mlat="+markerLat+
    "&mlon="+markerLon+"#map=17/"+markerLat+"/"+markerLon;
}



const STORE_MATCHERS = {
  carrefour: /carrefour/i,
  leclerc: /(?:e\.?\s*)?leclerc/i
};

export function normalizeBarcode(value) {
  const raw=String(value ?? "");
  // Spaces and simple visual separators are accepted when manually copying
  // a code. Letters, punctuation and control characters must not silently
  // disappear: stripping them could turn a corrupted scan into a valid SKU.
  if(/[^0-9 -]/.test(raw)){
    throw new Error("Code-barres invalide : seuls les chiffres, espaces et tirets sont acceptés.");
  }
  const digits=raw.replace(/[ -]/g,"");
  if(![8,12,13,14].includes(digits.length)) {
    throw new Error("Le code-barres doit contenir 8, 12, 13 ou 14 chiffres.");
  }
  return digits;
}

export async function fetchProductByBarcode(value, fetchImpl=fetch, {signal=null}={}) {
  const code=normalizeBarcode(value);
  const canonicalQuery=canonicalGtin(code);
  if(!canonicalQuery) throw new Error("Checksum GTIN invalide : recherche de produit annulée.");
  const fields=[
    "code","product_name","generic_name","brands","quantity",
    "image_front_url","nutrition_grades","categories_tags"
  ].join(",");
  const url=`${OFF_PRODUCT_API}/${encodeURIComponent(code)}?fields=${encodeURIComponent(fields)}&cc=fr&lc=fr`;
  const response=await fetchImpl(url,{headers:{Accept:"application/json"},signal});
  if(!response.ok) throw new Error(`Open Food Facts indisponible (${response.status}).`);
  const payload=await response.json();
  if(!payload?.product) throw new Error("Produit introuvable dans Open Food Facts.");
  const returnedCode=String(payload.product.code || code);
  // Protect against mismatched API/cache product records: the name, photo
  // and nutritional information must describe the scanned SKU itself.
  if(canonicalGtin(returnedCode)!==canonicalQuery){
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

/**
 * One short-lived request pool for a single two-retailer comparison.
 * Open Prices returns the same product-code pages irrespective of retailer:
 * the retailer is filtered locally by fetchPricesByBarcode. Share identical
 * GET/JSON responses to avoid downloading the same page twice on Android.
 * Both consumers must use the same AbortSignal and query options. Never
 * retain this pool between comparisons, products or sessions.
 */
export function createSharedPriceFetch(fetchImpl=fetch){
  const requests=new Map();
  return async (url,options={})=>{
    const key=String(url);
    if(!requests.has(key)){
      const job=(async()=>{
        const response=await fetchImpl(url,options);
        return {
          ok:response.ok,status:response.status,
          payload:response.ok ? await response.json() : null
        };
      })();
      requests.set(key,job);
    }
    const response=await requests.get(key);
    // Consumers receive independent response-like objects; the JSON body
    // is decoded only once and treated as read-only by the normalization code.
    return {ok:response.ok,status:response.status,
      json:async()=>response.payload};
  };
}

/**
 * Open Prices filters product_code by its exact representation. A UPC-A can
 * be entered as UPC-12, EAN-13 (one leading zero) or GTIN-14 (two zeros).
 * Ask for equivalent codes only as a bounded fallback when the retailer has
 * no recent observation under the original code. Never fuzzy-match names.
 */
function equivalentLongGtins(code,canonical){
  if(code.length<12) return [];
  return [12,13,14].filter((length)=>length!==code.length)
    .map((length)=>canonical.slice(-length))
    .filter((alias)=>canonicalGtin(alias)===canonical);
}

export async function fetchPricesByBarcode(value,{
  store,size=100,coords=null,radiusKm=25,fetchImpl=fetch,
  maxPages=2,minimumMatches=4,signal=null,alternateGtins=false,
  aliasFreshnessDays=30
}={}) {
  const code=normalizeBarcode(value);
  const canonicalQuery=canonicalGtin(code);
  if(!canonicalQuery) throw new Error("Checksum GTIN invalide : recherche de prix annulée.");
  const pageSize=Math.min(Math.max(Math.trunc(Number(size)||100),1),100);
  const pageLimit=Math.min(Math.max(Math.trunc(Number(maxPages)||2),1),3);
  const minMatches=Math.min(Math.max(Math.trunc(Number(minimumMatches)||4),1),20);
  // Two-store comparisons require a receipt within 7 days. A primary-code
  // receipt from 8–30 days ago must not suppress a fresher UPC/EAN alias.
  // Ordinary product lookup retains its existing 30-day request budget.
  const aliasDays=aliasFreshnessDays===7 ? 7 : 30;
  const params=new URLSearchParams({
    product_code:code,
    currency:"EUR",
    type:"PRODUCT",
    // Exclude personal consumption and superseded receipts before they
    // occupy a scarce paginated result slot; local checks remain mandatory.
    kind:"COMMUNITY",
    duplicate_of__isnull:"true",
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
      // A superseded receipt must not create an independent price signal.
      // Reject explicitly non-community or non-product rows even if an API
      // pagination/cache edge case returns them despite the query filters.
      if(!source || typeof source!=="object"
        || (source.duplicate_of!==null && source.duplicate_of!==undefined)
        || (source.kind!==undefined && source.kind!==null
          && source.kind!=="COMMUNITY")
        || (source.type!==undefined && source.type!==null
          && source.type!=="PRODUCT")) continue;
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
      // The pagination target must match the freshness the caller needs.
      // A 12-day-old receipt is useful history but cannot satisfy a 7-day
      // retailer comparison and must not hide a later page of eligible
      // evidence. Ordinary product lookups retain their 30-day threshold.
      if(isFreshObservation(observation,aliasDays)) recentUsableMatches+=1;
    }

    const declaredPages=Number(payload.pages);
    const hasMore=Number.isInteger(declaredPages) && declaredPages>=1
      ? page<declaredPages
      : total!==null
        ? page*pageSize<total
        : items.length>=pageSize;
    // An empty or short response does not negate the source's own
    // "there are more pages" metadata. We may stop paging to avoid a broken
    // endpoint loop, but must NOT present the search as exhaustive.
    moreAvailable=hasMore;
    if(page>=pageLimit || recentUsableMatches>=minMatches || items.length===0) break;
    if(!moreAvailable) break;
    // Without an explicit page count, a short page and a larger total are
    // contradictory signals. Stop safely, retaining incomplete coverage.
    if(!Number.isInteger(declaredPages) && items.length<pageSize) break;
  }

  const observations=all.sort((a,b)=>{
    if(coords){
      const da=Number.isFinite(a.distanceKm) ? a.distanceKm : Infinity;
      const db=Number.isFinite(b.distanceKm) ? b.distanceKm : Infinity;
      if(da!==db) return da-db;
    }
    return new Date(b.date)-new Date(a.date);
  });
  // Extra variants are intentionally opt-in: default product lookups keep
  // their historical request budget. A comparison can opt in for UPC/EAN
  // variants without fetching irrelevant aliases for normal EAN-13 codes.
  let aliasQueries=0,aliasRecovered=false,displayedSourceUrl=url;
  if(alternateGtins===true
    && !observations.some((item)=>isFreshObservation(item,aliasDays))){
    for(const alias of equivalentLongGtins(code,canonicalQuery)){
      if(signal?.aborted) throw new DOMException("Recherche annulée","AbortError");
      aliasQueries++;
      try{
        // One extra page per representation, at most two, even on 3G.
        // All the usual retailer, GTIN, currency, unit and geo checks run.
        const extra=await fetchPricesByBarcode(alias,{
          store,size:pageSize,coords,radiusKm,fetchImpl,
          maxPages:1,minimumMatches:1,signal,alternateGtins:false
        });
        pagesFetched+=extra.pagesFetched;
        partial=partial||extra.partial;
        moreAvailable=moreAvailable||extra.moreAvailable;
        if(Number.isInteger(extra.total)){
          total=Math.max(total ?? 0,extra.total);
        }
        for(const item of extra.observations){
          const key=item.id!==null && item.id!==undefined
            ? "id:"+String(item.id) :JSON.stringify([
                item.productCode,item.locationId,item.storeName,
                item.postcode,item.city,item.date,item.price
              ]);
          if(seen.has(key)) continue;
          seen.add(key);
          observations.push(item);
        }
        if(extra.observations.length){
          aliasRecovered=true;
          // The raw-data link must open the representation that actually
          // supplied the prices, not an empty initial UPC/EAN query.
          displayedSourceUrl=extra.sourceUrl;
          // A stale-only variant need not hide newer prices of another
          // representation. A fresh receipt ends the fallback early.
          if(extra.observations.some((item)=>isFreshObservation(item,aliasDays)))
            break;
        }
      }catch(error){
        if(signal?.aborted || error?.name==="AbortError") throw error;
        // Primary search succeeded: keep that result, mark incomplete,
        // and do not pretend all equivalent representations were checked.
        partial=true;
      }
    }
  }
  observations.sort((a,b)=>{
    if(coords){
      const da=Number.isFinite(a.distanceKm)?a.distanceKm:Infinity;
      const db=Number.isFinite(b.distanceKm)?b.distanceKm:Infinity;
      if(da!==db) return da-db;
    }
    return new Date(b.date)-new Date(a.date);
  });
  return {
    observations,total:total ?? observations.length,
    sourceUrl:displayedSourceUrl,
    pagesFetched,partial,moreAvailable,aliasQueries,aliasRecovered,
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
    && Number.isFinite(locationLon) && locationLon>=-180 && locationLon<=180
    // Null Island (0,0) is a common missing-geocode placeholder, not a
    // trustworthy retail outlet. It must not establish a "nearby" winner.
    && !(locationLat===0 && locationLon===0);
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

// Open Prices dates are French civil days, not timestamps. At 00:30
// in Paris a receipt dated today must not look "future" merely because
// UTC is still on yesterday. Use Paris midnight, including DST changes.
const PARIS_MIDNIGHT_HOUR=new Intl.DateTimeFormat("en-GB",{
  timeZone:"Europe/Paris",hour:"2-digit",hourCycle:"h23"
});
const DAY_MS=24*60*60*1000;
function parseObservationDay(value){
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const utcDay=new Date(value+"T00:00:00Z");
  if(!Number.isFinite(utcDay.getTime())
    || utcDay.toISOString().slice(0,10)!==value) return null;
  // Europe/Paris is UTC+01/+02 at local midnight. The offset observed
  // at UTC 00:00 is the same as at Paris midnight, even on DST days.
  const offsetHours=Number(PARIS_MIDNIGHT_HOUR.format(utcDay));
  if(!Number.isInteger(offsetHours) || offsetHours<0 || offsetHours>3) return null;
  return new Date(utcDay.getTime()-offsetHours*60*60*1000);
}

// Other screens may receive either calendar days or full ISO timestamps.
// Validate the civil date before parsing: JavaScript can silently normalize
// an impossible YYYY-MM-DD, including inside an otherwise valid timestamp.
export function parsePriceEvidenceDate(value){
  if(typeof value!=="string") return null;
  const match=/^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if(!match || !parseObservationDay(match[1])) return null;
  const date=value.length===10 ? parseObservationDay(value) : new Date(value);
  return date && Number.isFinite(date.getTime()) ? date : null;
}

export function isFreshObservation(observation,maxAgeDays=120,now=new Date()) {
  if(!observation?.date) return false;
  const date=parseObservationDay(observation.date);
  if(!date) return false;
  const ageMs=new Date(now).getTime()-date.getTime();
  return Number.isFinite(ageMs) && ageMs>=0 && ageMs<=maxAgeDays*DAY_MS;
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
  const date=parseObservationDay(observation.date);
  if(!date) return null;
  const ageMs=new Date(now).getTime()-date.getTime();
  if(!Number.isFinite(ageMs) || ageMs<0) return null;
  return Math.floor(ageMs/DAY_MS);
}

export function priceFreshness(observation,now=new Date()) {
  const date=parseObservationDay(observation?.date);
  const ageMs=date ? new Date(now).getTime()-date.getTime() : NaN;
  if(!Number.isFinite(ageMs) || ageMs<0){
    return {level:"unknown",label:"date inconnue",ageDays:null};
  }
  const ageDays=Math.floor(ageMs/DAY_MS);
  // Whole days are for display only: 7 days + 1 hour is NOT ≤ 7 days.
  if(ageMs<=7*DAY_MS) return {level:"very-recent",label:"≤ 7 jours",ageDays};
  if(ageMs<=30*DAY_MS) return {level:"recent",label:"≤ 30 jours",ageDays};
  if(ageMs<=120*DAY_MS) return {level:"old",label:"31–120 jours",ageDays};
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
    const dayA=a.date;
    const dayB=b.date;
    if(dayA!==dayB) return dayA<dayB ? 1 : -1;
    const priceDiff=Number(b.price)-Number(a.price);
    if(priceDiff!==0) return priceDiff;
    // Prefer a receipt with a declared proof if prices and dates agree.
    if(Boolean(a.proofType)!==Boolean(b.proofType)) return a.proofType ? -1 : 1;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  return ordered[0];
}
