import { parsePriceEvidenceDate, selectBestRecentPrice } from "./open-data.js";
import {parisCivilDay} from "./ingestion.js";
import {canonicalGtin} from "./gtin.js";

/** Use GS1 identity when valid; preserve legacy/non-GTIN local records. */
export function historyProductKey(code){
  const raw=String(code??"").trim();
  return canonicalGtin(raw) || raw;
}

export function priceLocationKey(observation){
  if(!observation) return null;
  if(observation.locationId !== null && observation.locationId !== undefined && String(observation.locationId).trim()){
    return "id:"+String(observation.locationId).trim();
  }
  const name=String(observation.storeName || "").trim().toLocaleLowerCase("fr");
  const postcode=String(observation.postcode || "").trim();
  if(!name || /non précisé|unknown|inconnu/.test(name) || !/^\d{5}$/.test(postcode)) return null;
  // A chain name plus postcode can still represent several physical shops.
  if(/^(carrefour|carrefour market|carrefour city|carrefour contact|e\.?\s*leclerc|leclerc)$/.test(name)){
    return null;
  }
  return "named:"+name+"|"+postcode;
}

export function addPriceObservation(history,{
  product,
  store,
  observation,
  recordedAt=new Date()
}={}, {limitPerProduct=30}={}) {
  const existing=Array.isArray(history) ? history : [];
  const price=Number(observation?.price);
  const seenAt=new Date(recordedAt);
  // Open Prices records calendar days in France. Parsing YYYY-MM-DD as UTC
  // would reject a legitimate same-day receipt between Paris midnight and
  // UTC midnight (one or two hours later, depending on DST).
  const observationAt=parsePriceEvidenceDate(observation?.date);
  const locationKey=priceLocationKey(observation);
  if(!product?.code || !store || !Number.isFinite(price) || price<=0
    || !locationKey || Number.isNaN(seenAt.getTime()) || !observationAt
    || observationAt>seenAt) return existing;

  const productKey=historyProductKey(product.code);
  const entry={
    id:priceEntryId(productKey,store,locationKey,observation.date,price),
    recordedAt:seenAt.toISOString(),
    code:productKey,
    name:product.name || "Produit",
    store,
    price,
    date:observation.date,
    locationKey,
    locationId:observation.locationId ?? null,
    storeName:observation.storeName || "",
    city:observation.city || "",
    postcode:observation.postcode || "",
    isDiscounted:Boolean(observation.isDiscounted)
  };

  // Keep historical entries readable without a destructive migration.
  // A newly scanned EAN variant of the same exact receipt replaces the
  // equivalent old UPC/EAN record instead of duplicating its history.
  const merged=[entry,...existing.filter((item)=>
    item.id!==entry.id && !(
      historyProductKey(item?.code)===productKey
      && item.store===store
      && priceLocationKey(item)===locationKey
      && String(item.date)===String(entry.date)
      && Number(item.price)===price
    )
  )];
  const counts=new Map();
  return merged.filter((item)=>{
    const key=historyProductKey(item.code)+"|"+String(item.store);
    const count=counts.get(key)||0;
    if(count>=limitPerProduct) return false;
    counts.set(key,count+1);
    return true;
  }).slice(0,500);
}

// Preserve an observation for each independently identifiable physical shop.
// A single cheapest/latest observation for the entire chain would hide a real
// drop at a different location and prevent useful local alerts.
export function addStorePriceObservations(history,{
  product,store,observations=[],recordedAt=new Date()
}={}, {maxStores=12,limitPerProduct=30}={}){
  const groups=new Map();
  for(const observation of observations || []){
    const key=priceLocationKey(observation);
    if(!key) continue;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(observation);
  }
  const selected=[...groups.entries()]
    .map(([key,items])=>({key,observation:selectBestRecentPrice(items,120,recordedAt)}))
    .filter((item)=>Boolean(item.observation))
    .sort((a,b)=>new Date(b.observation.date)-new Date(a.observation.date))
    .slice(0,Math.min(30,Math.max(1,Math.trunc(maxStores)||12)));
  return selected.reduce((acc,item)=>addPriceObservation(acc,{
    product,store,observation:item.observation,recordedAt
  },{limitPerProduct}),history || []);
}

function observationDate(item){
  const time=parsePriceEvidenceDate(item?.date)?.getTime();
  return Number.isFinite(time) ? time : -Infinity;
}

// Group Open Prices calendar days by their original French date. Historical
// ISO timestamps, if present in older storage, are grouped by Paris's date,
// not the UTC calendar day that might be one day behind on Android.
function observationDay(item){
  const value=item?.date;
  const instant=parsePriceEvidenceDate(value);
  if(!instant) return null;
  return value.length===10 ? value : parisCivilDay(instant);
}

function usableHistory(history,{code,store}={}){
  return (history || [])
    .filter((item)=>historyProductKey(item?.code)===historyProductKey(code))
    .filter((item)=>!store || item.store===store)
    .filter((item)=>Number.isFinite(item?.price) && item.price>0)
    .filter((item)=>observationDate(item)>-Infinity)
    .map((item)=>({...item,locationKey:priceLocationKey(item)}))
    .filter((item)=>Boolean(item.locationKey))
    .sort((a,b)=>observationDate(b)-observationDate(a));
}

export function productPriceTrend(history,{code,store,locationId=null,locationKey=null}={}) {
  const values=usableHistory(history,{code,store});
  // An explicit shop must never fall back to receipts from other locations.
  const pinnedKey=locationKey || (locationId!==null ? "id:"+String(locationId) : null);
  // Without a selected shop, prefer the newest location for which an actual
  // two-day trend exists. The newest observation alone is insufficient.
  const keys=pinnedKey ? [pinnedKey] : [...new Set(values.map((item)=>item.locationKey))];
  for(const key of keys){
    const sameLocation=values.filter((item)=>item.locationKey===key);
    if(sameLocation.length<2) continue;

    // Same-day contradictory receipts use the highest observed price so
    // a temporary cheap checkout does not manufacture a price drop.
    const latestDay=observationDay(sameLocation[0]);
    const latest=sameLocation.filter((item)=>
      observationDay(item)===latestDay
    ).sort((a,b)=>b.price-a.price)[0];
    const previousCandidates=sameLocation.filter((item)=>
      observationDay(item)<latestDay
    );
    if(!previousCandidates.length) continue;
    const previousDay=observationDay(previousCandidates[0]);
    const previous=previousCandidates.filter((item)=>
      observationDay(item)===previousDay
    ).sort((a,b)=>b.price-a.price)[0];

    const delta=round(latest.price-previous.price);
    const percent=previous.price>0
      ? Math.round((delta/previous.price)*10000)/100
      : 0;
    return {
      latest,previous,delta,percent,locationKey:key,
      direction:delta<0?"down":delta>0?"up":"flat"
    };
  }
  return null;
}

/**
 * Historical drops are not real-time prices. Consumers may opt into a
 * freshness window for user-facing alerts; archival analysis remains
 * available without a cutoff for older saved records and reports.
 */
export function detectPriceDrops(history,{
  thresholdPercent=10,now=new Date(),maxAgeDays=null
}={}) {
  const cutoffEnabled=maxAgeDays!==null && Number.isFinite(maxAgeDays)
    && maxAgeDays>=0;
  const nowTime=new Date(now).getTime();
  const groups=new Map();
  for(const item of history || []){
    const key=priceLocationKey(item);
    if(!key || !item.code || !item.store) continue;
    const productKey=historyProductKey(item.code);
    groups.set(JSON.stringify([productKey,item.store,key]),{
      code:productKey,store:item.store,locationKey:key
    });
  }
  const alerts=[];
  for(const group of groups.values()){
    const trend=productPriceTrend(history,group);
    if(!trend || trend.direction!=="down") continue;
    if(cutoffEnabled){
      const latestTime=observationDate(trend.latest);
      const age=nowTime-latestTime;
      if(!Number.isFinite(nowTime) || !Number.isFinite(latestTime)
        || age<0 || age>maxAgeDays*24*60*60*1000) continue;
    }
    const drop=Math.abs(trend.percent);
    if(drop<thresholdPercent) continue;
    alerts.push({
      code:group.code,
      store:group.store,
      locationKey:group.locationKey,
      storeName:trend.latest.storeName || "",
      name:trend.latest.name,
      latestPrice:trend.latest.price,
      previousPrice:trend.previous.price,
      latestIsDiscounted:trend.latest.isDiscounted===true,
      previousIsDiscounted:trend.previous.isDiscounted===true,
      dropPercent:drop,
      date:trend.latest.date,
      recordedAt:trend.latest.recordedAt
    });
  }
  return alerts.sort((a,b)=>b.dropPercent-a.dropPercent);
}

export function productHistory(history,{code,store=null,limit=12}={}) {
  return (history || [])
    .filter((item)=>historyProductKey(item?.code)===historyProductKey(code))
    .filter((item)=>!store || item.store===store)
    .sort((a,b)=>observationDate(b)-observationDate(a))
    .slice(0,limit);
}

function priceEntryId(code,store,locationKey,date,price){
  return [code,store,locationKey,date,Number(price).toFixed(4)].join("|");
}

function round(value){
  return Math.round((Number(value)+Number.EPSILON)*100)/100;
}
