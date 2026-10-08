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
  return {
    code:payload.product.code || code,
    name:payload.product.product_name || payload.product.generic_name || "Produit sans nom",
    brands:payload.product.brands || "",
    quantity:payload.product.quantity || "",
    imageUrl:payload.product.image_front_url || "",
    nutriScore:payload.product.nutrition_grades || null,
    categories:payload.product.categories_tags || [],
    sourceUrl:`https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`
  };
}

export async function fetchPricesByBarcode(value,{store,size=100,coords=null,radiusKm=25,fetchImpl=fetch}={}) {
  const code=normalizeBarcode(value);
  const params=new URLSearchParams({
    product_code:code,
    currency:"EUR",
    type:"PRODUCT",
    order_by:"-date",
    size:String(Math.min(Math.max(Number(size)||100,1),100))
  });
  let requestedRadius=null;
  if(coords){
    const lat=Number(coords.latitude ?? coords.lat);
    const lon=Number(coords.longitude ?? coords.lon);
    if(!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180){
      throw new Error("Coordonnées géographiques invalides.");
    }
    const radius=Math.min(Math.max(Number(radiusKm)||25,1),100);
    requestedRadius=radius;
    params.set("lat",String(lat));
    params.set("lon",String(lon));
    params.set("radius_km",String(radius));
  }
  const url=`${OPEN_PRICES_API}?${params}`;
  const response=await fetchImpl(url,{headers:{Accept:"application/json"}});
  if(!response.ok) throw new Error(`Open Prices indisponible (${response.status}).`);
  const payload=await response.json();
  const observations=(Array.isArray(payload?.items) ? payload.items : [])
    .map((item)=>normalizePriceObservation(item,coords))
    .filter((item)=>String(item.productCode)===code)
    .filter((item)=>item.currency==="EUR")
    .filter((item)=>Number.isFinite(item.price) && item.price>0)
    .filter((item)=>isUnambiguousRetailer(item.retailerText,store))
    // Do not trust a server-side radius filter without local coordinates.
    .filter((item)=>requestedRadius===null
      || (Number.isFinite(item.distanceKm) && item.distanceKm<=requestedRadius+0.1))
    .sort((a,b)=>{
      if(coords){
        const da=Number.isFinite(a.distanceKm) ? a.distanceKm : Infinity;
        const db=Number.isFinite(b.distanceKm) ? b.distanceKm : Infinity;
        if(da!==db) return da-db;
      }
      return new Date(b.date)-new Date(a.date);
    });
  return {observations,total:payload?.total ?? observations.length,sourceUrl:url};
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
    date:item.date || item.updated || item.created || null,
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
  const values=[lat1,lon1,lat2,lon2].map(Number);
  if(values.some((value)=>!Number.isFinite(value))) return null;
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
  const preferred=candidates.filter((item)=>{
    const age=observationAgeDays(item,now);
    return age!==null && age<=preferredAgeDays;
  });
  const pool=preferred.length ? preferred : candidates;
  return [...pool].sort((a,b)=>{
    const priceDiff=Number(a.price)-Number(b.price);
    if(priceDiff!==0) return priceDiff;
    return new Date(b.date)-new Date(a.date);
  })[0];
}
