import {normalizePriceObservation,isFreshObservation,isUnambiguousRetailer,priceObservationPublicUrl} from "./open-data.js";
import {isValidGtin} from "./gtin.js";
import {parisCivilDay} from "./ingestion.js";

// Public, documented Open Prices API. A receipt/label observation is not a
// retailer catalogue, a guarantee of checkout price or a stackable voucher.
const API="https://prices.openfoodfacts.org/api/v1/prices";
const NAMES={carrefour:"Carrefour",leclerc:"Leclerc"};
const ACCEPTED_DISCOUNTS=new Set(["SALE","SEASONAL","EXPIRES_SOON"]);

// Strict enough to avoid animal, household, hygiene and alcoholic products
// entering an unqualified grocery recommendations list. Unknown categories
// from OFF are kept as evidence to consult, never treated as food proof.
const EXCLUDED_CATEGORIES=/(?:alcoholic|beers|wines|spirits|pet-food|cat-food|dog-food|cosmetics|beauty|cleaning|detergent|household|non-food|hygiene)/i;

function validCoordinates(coords){
  if(!coords) return null;
  const lat=Number(coords.latitude ?? coords.lat);
  const lon=Number(coords.longitude ?? coords.lon);
  if(!Number.isFinite(lat)||lat < -90||lat > 90
    ||!Number.isFinite(lon)||lon < -180||lon > 180)
    throw new Error("Coordonnées de recherche invalides.");
  return {latitude:lat,longitude:lon};
}
function round(value){return Math.round((value+Number.EPSILON)*100)/100;}
function dayMinus(date,days){
  const day=parisCivilDay(date);
  const utc=new Date(day+"T12:00:00Z");
  utc.setUTCDate(utc.getUTCDate()-days);
  return utc.toISOString().slice(0,10);
}

/** Trust only a single-unit price label with its OWN prior price and proof. */
export function normalizeCommunityDiscount(item,{
  store,coords=null,radiusKm=25,now=new Date()
}={}){
  if(!item || item.type!=="PRODUCT"
    || item.price_is_discounted!==true
    || !ACCEPTED_DISCOUNTS.has(item.discount_type)
    || item.duplicate_of!==null && item.duplicate_of!==undefined
    || item.currency!=="EUR"
    // Open Prices represents a default unit price with price_per:null.
    // Its existing normalization maps that to UNIT. Refuse only a stated
    // non-unit measure, rather than dropping ordinary EAN-labelled items.
    || item.price_per!==null && item.price_per!==undefined
      && item.price_per!=="UNIT"
    || !Number.isSafeInteger(item.id) || item.id<=0
    || !priceObservationPublicUrl(item.id)) return null;
  const code=String(item.product_code || item.product?.code || "");
  if(!isValidGtin(code)) return null;
  // Only OFF food entries; reject clear non-food/alcohol, refuse empty names.
  if(item.product?.source!=="off") return null;
  const tags=Array.isArray(item.product.categories_tags)
    ? item.product.categories_tags:[];
  if(tags.some((tag)=>EXCLUDED_CATEGORIES.test(String(tag)))) return null;
  const name=String(item.product.product_name || item.product_name || "").trim();
  if(!name || name.length>180) return null;
  const observation=normalizePriceObservation(item,coords);
  if(!isUnambiguousRetailer(observation.retailerText,store)
    || !observation.locationId
    || !isFreshObservation(observation,7,now)) return null;
  if(coords && (!Number.isFinite(observation.distanceKm)
    || observation.distanceKm>radiusKm+0.1)) return null;
  const price=item.price,regular=item.price_without_discount;
  // Zero/negative discounts and mismatched units are not exploitable.
  if(!Number.isFinite(price)||price<=0||price>1000
    ||typeof regular!=="number"||!Number.isFinite(regular)
    ||regular<=price||regular>1000) return null;
  // Missing or untraceable proof must never become a recommended saving.
  if(!Number.isSafeInteger(item.proof_id)||item.proof_id<=0
    ||!["PRICE_TAG","RECEIPT","SHOP_IMPORT"].includes(item.proof?.type)) return null;
  const saving=round(regular-price);
  const percent=round(saving/regular*100);
  if(saving<=0 || percent<=0 || percent>95) return null;
  return {
    id:item.id,code,title:name,store,price:round(price),regular:round(regular),
    saving,percent,date:observation.date,
    storeName:observation.storeName,city:observation.city,
    postcode:observation.postcode,distanceKm:observation.distanceKm,
    proofType:item.proof.type,sourceUrl:priceObservationPublicUrl(item.id)
  };
}

/**
 * Bounded, opt-in geolocation and two-page maximum. No CAPTCHA / private
 * retailer API, no cached GPS coordinates, no automatic promotion imports.
 */
export async function fetchCommunityDiscounts({
  store,coords=null,radiusKm=25,fetchImpl=fetch,
  now=new Date(),signal=null,maxPages=2
}={}){
  if(!NAMES[store]) throw new Error("Enseigne non reconnue.");
  const location=validCoordinates(coords);
  const radius=Number(radiusKm);
  if(location && (!Number.isFinite(radius)||radius<1||radius>100))
    throw new Error("Rayon de recherche invalide.");
  const params=new URLSearchParams({
    currency:"EUR",type:"PRODUCT",price_is_discounted:"true",
    "date__gte":dayMinus(now,7),"order_by":"-date",size:"100"
  });
  // The documented location__osm_name__contains filter currently
  // returns ZERO even for brands present in public global results (verified
  // against Netto, Carrefour and Leclerc on 15 Oct 2026). Query the bounded
  // recent discounted feed and validate retailer identity LOCALLY instead.
  // With opted-in GPS, the API's geographic filter further bounds results.
  if(location){
    params.set("lat",String(location.latitude));
    params.set("lon",String(location.longitude));
    params.set("radius_km",String(radius));
  }
  const bound=Math.min(Math.max(Math.trunc(maxPages)||2,1),2);
  const all=new Map();
  let pagesFetched=0,partial=false,moreAvailable=false,total=null;
  for(let page=1;page<=bound;page++){
    if(signal?.aborted) throw new DOMException("Recherche annulée","AbortError");
    const pageParams=new URLSearchParams(params);
    if(page>1) pageParams.set("page",String(page));
    let data;
    try{
      const response=await fetchImpl(API+"?"+pageParams,{
        headers:{Accept:"application/json"},signal
      });
      if(!response.ok) throw new Error("HTTP "+response.status);
      data=await response.json();
      if(!data || !Array.isArray(data.items)) throw new Error("Réponse JSON invalide");
    }catch(error){
      if(signal?.aborted) throw error;
      if(page===1) throw new Error("Open Prices inaccessible : "+(error.message||error));
      partial=true;
      break;
    }
    pagesFetched++;
    if(Number.isInteger(data.total) && data.total>=0) total=data.total;
    for(const row of data.items){
      const deal=normalizeCommunityDiscount(row,{
        store,coords:location,radiusKm:radiusKm,now
      });
      if(!deal) continue;
      const key=String(deal.code)+"|"+String(row.location_id || row.location?.id);
      const previous=all.get(key);
      // Prefer latest evidence at a given store and SKU, never best price
      // from an older observation or a different branch.
      if(!previous || deal.date>previous.date
        || deal.date===previous.date && deal.price>previous.price){
        all.set(key,deal);
      }
    }
    const pages=Number(data.pages);
    moreAvailable=Number.isInteger(pages) && pages>=1
      ?page<pages
      :total!==null ?page*100<total:data.items.length>=100;
    if(!moreAvailable || data.items.length===0) break;
  }
  return {
    results:[...all.values()],pagesFetched,
    partial,searchIncomplete:partial || moreAvailable,
    source:"Open Prices / Open Food Facts",
    scannedTotal:total
  };
}

export function selectCommunityDiscounts(items,{
  budget=null,sort="percent",now=new Date(),limit=12
}={}){
  const cap=Number.isFinite(budget) && budget>0?budget:null;
  const rows=(Array.isArray(items)?items:[])
    .filter((x)=>x && Number.isFinite(x.price)&&x.price>0
      && Number.isFinite(x.saving)&&x.saving>0
      && Number.isFinite(x.percent)&&x.percent>0
      && Number.isFinite(x.regular)&&x.regular>x.price
      && isFreshObservation(x,7,now)
      && (cap===null || x.price<=cap));
  const bySort={
    percent:(a,b)=>b.percent-a.percent||b.saving-a.saving,
    euros:(a,b)=>b.saving-a.saving||b.percent-a.percent,
    budget:(a,b)=>a.price-b.price||b.percent-a.percent,
    net:(a,b)=>a.price-b.price||b.percent-a.percent
  }[sort] || ((a,b)=>b.percent-a.percent);
  return rows.sort((a,b)=>bySort(a,b)
    || b.date.localeCompare(a.date)
    || String(a.id).localeCompare(String(b.id))).slice(0,Math.min(Math.max(limit,1),30));
}
