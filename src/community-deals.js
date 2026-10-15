import {canonicalGtin} from "./gtin.js";
import {parisCivilDay} from "./ingestion.js";
import {
  normalizePriceObservation,isFreshObservation,
  isUnambiguousRetailer,priceObservationPublicUrl
} from "./open-data.js";

const SOURCE="https://prices.openfoodfacts.org/api/v1/prices";
const LABELS={carrefour:"Carrefour",leclerc:"Leclerc"};
const DISCOUNT_TYPES=new Set(["SALE","SEASONAL","EXPIRES_SOON"]);
const NON_FOOD=/alcohol|beer|wine|spirit|liqueur|pet.food|animal.feed|tobacco|household|cleaning|detergent|cosmetic|hygiene/i;
const DAY_MS=86400000;

function dateMinusDays(now,days){
  const day=parisCivilDay(new Date(now));
  if(!day) throw new Error("Date de recherche invalide.");
  return new Date(Date.parse(day+"T12:00:00Z")-days*DAY_MS)
    .toISOString().slice(0,10);
}
function supportedStore(store){
  if(!Object.hasOwn(LABELS,store)) throw new Error("Enseigne non prise en charge.");
  return store;
}
// Explicitly opt-in only. Invalid coordinates must never silently fall back
// to a global search with an apparently local result label.
function nearbySearch(coords,radiusKm){
  if(coords===null || coords===undefined) return null;
  const lat=coords.latitude,lon=coords.longitude;
  if(typeof lat!=="number" || typeof lon!=="number"
    || !Number.isFinite(lat) || lat < -90 || lat > 90
    || !Number.isFinite(lon) || lon < -180 || lon > 180
    || !Number.isFinite(radiusKm) || radiusKm<1 || radiusKm>100)
    throw new Error("Coordonnées ou rayon de proximité invalides.");
  return {latitude:lat,longitude:lon,radiusKm};
}
export function normalizeObservedDiscount(raw,{
  store,now=new Date(),maxAgeDays=7,coords=null,radiusKm=25
}={}){
  if(!raw || typeof raw!=="object" || !Object.hasOwn(LABELS,store)) return null;
  // This is an observed unit-price reduction, never a coupon, a quantity
  // promotion or a loyalty reward usable without further confirmation.
  if(raw.type!=="PRODUCT" || raw.price_is_discounted!==true
    || !DISCOUNT_TYPES.has(raw.discount_type)) return null;
  const product=raw.product || {};
  const categories=Array.isArray(product.categories_tags)
    ?product.categories_tags.filter((tag)=>typeof tag==="string"):[];
  // OFF identifies food products, but also contains drinks and miscellaneous
  // goods. Do not label unknown/unclassified items as food bargains.
  if(product.source!=="off" || !categories.length
    || categories.some((tag)=>NON_FOOD.test(tag))) return null;
  const code=String(raw.product_code || product.code || "");
  if(!canonicalGtin(code)) return null;
  const nearby=nearbySearch(coords,radiusKm);
  const observation=normalizePriceObservation(raw,nearby);
  // Verify proximity locally as well as in the API: an incomplete/malformed
  // location must not be advertised as a nearby store.
  if(nearby && (!Number.isFinite(observation.distanceKm)
    || observation.distanceKm>nearby.radiusKm)) return null;
  const sourceUrl=priceObservationPublicUrl(observation.id);
  const proofId=Number(raw.proof_id);
  const title=String(product.product_name || raw.product_name || "").trim();
  const sourceLocation=raw.location && typeof raw.location==="object"
    && !Array.isArray(raw.location) ?raw.location:{};
  const addressPart=(value,limit)=>typeof value==="string"
    && value.length<=limit ?value.trim():"";
  const storeStreet=[
    addressPart(sourceLocation.osm_address_housenumber,16),
    addressPart(sourceLocation.osm_address_street,120)
  ].filter(Boolean).join(" ").slice(0,140);
  if(!sourceUrl || !Number.isSafeInteger(proofId) || proofId<1
    || !title || title.length>180 || !isFreshObservation(observation,maxAgeDays,now)
    || !isUnambiguousRetailer(observation.retailerText,store)
    || !/^\d{5}$/.test(String(observation.postcode||""))
    || !Number.isFinite(observation.price) || observation.price<=0
    || !Number.isFinite(observation.priceWithoutDiscount)
    || observation.priceWithoutDiscount<=observation.price
    || observation.pricePer!=="UNIT" || observation.currency!=="EUR")
    return null;
  // Do not imply a reliable comparison when the price difference is too
  // small to survive cent rounding, or when the observed percent is absurd.
  const cents=Math.round(observation.price*100);
  const regularCents=Math.round(observation.priceWithoutDiscount*100);
  const savedCents=regularCents-cents;
  if(savedCents<1 || cents<=0 || regularCents<=cents || regularCents>100000) return null;
  return {
    id:observation.id,code,title:title.slice(0,180),
    store,storeName:String(observation.storeName).slice(0,100),
    locationId:verifiedOutletId(raw),storeStreet,
    postcode:observation.postcode,city:String(observation.city).slice(0,80),
    date:observation.date,sourceUrl,
    distanceKm:nearby?observation.distanceKm:null,
    price:cents/100,regularPrice:regularCents/100,
    savingAmount:savedCents/100,
    savingPercent:Math.round(savedCents/regularCents*10000)/100,
    // Proof is a community observation, not a guarantee of a current
    // promotion and not eligible for automatic basket/cashback stacking.
    proofId,proofType:observation.proofType || null,
    discountType:raw.discount_type
  };
}

export function selectObservedDiscounts(records,{
  postcode="",sort="percent",maxSpend=null,limit=15
}={}){
  const zip=String(postcode).trim();
  if(zip && !/^\d{5}$/.test(zip)) throw new Error("Code postal : cinq chiffres requis.");
  const ceiling=maxSpend===null ? null : Number(maxSpend);
  const safeLimit=Number.isInteger(limit)?Math.min(Math.max(limit,1),30):15;
  const comparator=(a,b)=>{
    if(sort==="distance"){
      const da=Number.isFinite(a.distanceKm)?a.distanceKm:Infinity;
      const db=Number.isFinite(b.distanceKm)?b.distanceKm:Infinity;
      return da-db || b.savingPercent-a.savingPercent || b.savingAmount-a.savingAmount;
    }
    if(sort==="euros") return b.savingAmount-a.savingAmount || b.savingPercent-a.savingPercent;
    if(sort==="budget" || sort==="net") return a.price-b.price || b.savingPercent-a.savingPercent;
    return b.savingPercent-a.savingPercent || b.savingAmount-a.savingAmount;
  };
  return (Array.isArray(records)?records:[])
    .filter((r)=>!zip || r.postcode===zip)
    .filter((r)=>ceiling===null || Number.isFinite(ceiling)
      && ceiling>0 && r.price<=ceiling)
    .sort((a,b)=>comparator(a,b) || b.date.localeCompare(a.date)
      || String(a.code).localeCompare(String(b.code)))
    .slice(0,safeLimit);
}

/**
 * A chain label plus postcode does not identify one outlet: several shops
 * can share both. Only the Open Prices location ID identifies receipts from
 * the same physical place. Where it is absent or contradictory, preserve
 * separate receipt IDs instead of discarding another shop's observed price.
 */
function verifiedOutletId(raw){
  const ids=[raw?.location_id,raw?.location?.id]
    .filter((value)=>value!==null && value!==undefined);
  const valid=(value)=>/^[1-9]\d{0,15}$/.test(String(value))
    && Number.isSafeInteger(Number(value));
  return ids.length && ids.every(valid)
    && ids.every((id)=>Number(id)===Number(ids[0]))
    ?Number(ids[0]):null;
}
function observedOutletKey(raw,item){
  const outletId=verifiedOutletId(raw);
  return outletId===null?"receipt:"+String(item.id):"outlet:"+outletId;
}

export async function fetchObservedDiscounts({
  store="carrefour",now=new Date(),maxAgeDays=7,
  fetchImpl=fetch,signal=null,maxPages=3,
  coords=null,radiusKm=25
}={}){
  supportedStore(store);
  const nearby=nearbySearch(coords,radiusKm);
  const cutoff=dateMinusDays(now,Math.min(7,Math.max(1,maxAgeDays)));
  const safePages=Number.isInteger(maxPages)?Math.max(1,Math.min(maxPages,3)):3;
  const records=[];
  const dedup=new Map();
  let total=null,pagesFetched=0,partial=false,moreAvailable=false;
  for(let page=1;page<=safePages;page++){
    if(signal?.aborted) throw new DOMException("Recherche annulée","AbortError");
    const query=new URLSearchParams({
      currency:"EUR",type:"PRODUCT",price_is_discounted:"true",
      date__gte:cutoff,order_by:"-date",size:"100",page:String(page)
      // The Open Prices location-name filter has returned empty pages for
      // retailers present in global results. Filter retailer identity locally
      // with isUnambiguousRetailer after bounded public API retrieval.
    });
    // Official public geo filter added in Open Prices v1.109 (Aug 2026).
    // Only send coordinates after explicit user consent in the PWA.
    if(nearby){
      query.set("lat",String(nearby.latitude));
      query.set("lon",String(nearby.longitude));
      query.set("radius_km",String(nearby.radiusKm));
    }
    let body;
    try{
      const response=await fetchImpl(SOURCE+"?"+query.toString(),{
        headers:{Accept:"application/json"},signal
      });
      if(!response.ok) throw new Error("HTTP "+response.status);
      body=await response.json();
      if(!body || !Array.isArray(body.items)) throw new Error("Réponse invalide");
    }catch(error){
      if(signal?.aborted) throw error;
      if(page===1) throw new Error("Open Prices inaccessible : "+error.message);
      partial=true;break;
    }
    pagesFetched++;
    const declaredTotal=Number(body.total);
    if(Number.isInteger(declaredTotal) && declaredTotal>=0) total=declaredTotal;
    for(const raw of body.items){
      const item=normalizeObservedDiscount(raw,{store,now,maxAgeDays,
        coords:nearby,radiusKm});
      if(!item) continue;
      const key=item.code+"|"+observedOutletKey(raw,item);
      const prior=dedup.get(key);
      // Same SKU in the same outlet: newer observation first; on the
      // same day, prefer the higher checkout price conservatively.
      if(!prior || item.date>prior.date
        || item.date===prior.date && item.price>prior.price) dedup.set(key,item);
    }
    const declaredPages=Number(body.pages);
    moreAvailable=Number.isInteger(declaredPages) && declaredPages>0
      ?page<declaredPages
      :total!==null ? page*100<total : body.items.length===100;
    if(!moreAvailable || body.items.length===0) break;
  }
  records.push(...dedup.values());
  return {records,checkedAt:new Date(now).toISOString(),
    total,partial,moreAvailable, pagesFetched,cutoff,
    // The API is community sourced and capped at 300 recent observations
    // per query. Even local geo-filtered coverage may be incomplete.
    incomplete:partial||moreAvailable,
    mode:nearby?"nearby":"national",
    source:"Open Prices / Open Food Facts · ODbL"};
}


/**
 * Public French municipality centres provide an explicitly approximate
 * search origin without requesting device geolocation. A postal code may
 * identify several towns: return all valid choices instead of guessing one.
 * No result is stored persistently or mixed with the user's GPS position.
 */
export async function lookupPostalCodeCommunes(postcode,{
  fetchImpl=fetch,signal=null
}={}){
  const code=String(postcode).trim();
  if(!/^\d{5}$/.test(code)){
    throw new Error("Saisir un code postal de cinq chiffres.");
  }
  const params=new URLSearchParams({
    codePostal:code,fields:"nom,code,centre,population,codesPostaux",
    format:"json"
  });
  const response=await fetchImpl(
    "https://geo.api.gouv.fr/communes?"+params.toString(),
    {headers:{Accept:"application/json"},signal,redirect:"error"}
  );
  if(!response.ok) throw new Error("Référentiel officiel indisponible (HTTP "+response.status+").");
  const rows=await response.json();
  if(!Array.isArray(rows) || rows.length>200){
    throw new Error("Réponse du référentiel géographique invalide.");
  }
  const result=[],seen=new Set();
  for(const row of rows){
    const coords=row?.centre?.coordinates;
    const id=String(row?.code||"");
    const name=String(row?.nom||"").trim();
    if(!Array.isArray(coords) || coords.length!==2
      || typeof coords[0]!=="number" || typeof coords[1]!=="number"
      || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])
      || Math.abs(coords[0])>180 || Math.abs(coords[1])>90
      || !/^[0-9A-Z]{5}$/.test(id) || name.length<2 || name.length>100
      || !Array.isArray(row.codesPostaux)
      || !row.codesPostaux.includes(code) || seen.has(id)) continue;
    seen.add(id);
    result.push({
      code:id,nom:name,
      // Municipality centre, not a person or exact retail address.
      latitude:Math.round(coords[1]*1000)/1000,
      longitude:Math.round(coords[0]*1000)/1000,
      population:Number.isInteger(row.population)&&row.population>=0
        ?row.population:0
    });
  }
  return result.sort((a,b)=>b.population-a.population
    || a.nom.localeCompare(b.nom,"fr") || a.code.localeCompare(b.code));
}
