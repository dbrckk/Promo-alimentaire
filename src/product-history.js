import { selectBestRecentPrice } from "./open-data.js";

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
  const observationAt=new Date(observation?.date);
  const locationKey=priceLocationKey(observation);
  if(!product?.code || !store || !Number.isFinite(price) || price<=0
    || !locationKey || Number.isNaN(seenAt.getTime()) || Number.isNaN(observationAt.getTime())
    || observationAt>seenAt) return existing;

  const entry={
    id:priceEntryId(product.code,store,locationKey,observation.date,price),
    recordedAt:seenAt.toISOString(),
    code:String(product.code),
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

  const merged=[entry,...existing.filter((item)=>item.id!==entry.id)];
  const counts=new Map();
  return merged.filter((item)=>{
    const key=String(item.code)+"|"+String(item.store);
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
  const time=new Date(item?.date).getTime();
  return Number.isFinite(time) ? time : -Infinity;
}

function usableHistory(history,{code,store}={}){
  return (history || [])
    .filter((item)=>String(item?.code)===String(code))
    .filter((item)=>!store || item.store===store)
    .filter((item)=>Number.isFinite(item?.price) && item.price>0)
    .filter((item)=>observationDate(item)>-Infinity)
    .map((item)=>({...item,locationKey:priceLocationKey(item)}))
    .filter((item)=>Boolean(item.locationKey))
    .sort((a,b)=>observationDate(b)-observationDate(a));
}

export function productPriceTrend(history,{code,store,locationId=null,locationKey=null}={}) {
  const values=usableHistory(history,{code,store});
  const key=locationKey || (locationId!==null ? "id:"+String(locationId) : values[0]?.locationKey);
  if(!key) return null;
  const sameLocation=values.filter((item)=>item.locationKey===key);
  if(sameLocation.length<2) return null;

  // Use the highest observed amount within each calendar day when sources
  // disagree. This avoids falsely reporting a price drop from one cheap
  // promotional receipt despite a higher same-day checkout price.
  const latestDay=new Date(sameLocation[0].date).toISOString().slice(0,10);
  const latest=[...sameLocation]
    .filter((item)=>new Date(item.date).toISOString().slice(0,10)===latestDay)
    .sort((a,b)=>b.price-a.price)[0];
  const previousCandidates=sameLocation.filter((item)=>
    new Date(item.date).toISOString().slice(0,10)<latestDay
  );
  if(!previousCandidates.length) return null;
  const previousDay=new Date(previousCandidates[0].date).toISOString().slice(0,10);
  const previous=[...previousCandidates]
    .filter((item)=>new Date(item.date).toISOString().slice(0,10)===previousDay)
    .sort((a,b)=>b.price-a.price)[0];

  const delta=round(latest.price-previous.price);
  const percent=previous.price>0
    ? Math.round((delta/previous.price)*10000)/100
    : 0;
  return {
    latest,previous,delta,percent,locationKey:key,
    direction:delta<0?"down":delta>0?"up":"flat"
  };
}

export function detectPriceDrops(history,{thresholdPercent=10}={}) {
  const groups=new Map();
  for(const item of history || []){
    const key=priceLocationKey(item);
    if(!key || !item.code || !item.store) continue;
    groups.set(JSON.stringify([String(item.code),item.store,key]),{
      code:String(item.code),store:item.store,locationKey:key
    });
  }
  const alerts=[];
  for(const group of groups.values()){
    const trend=productPriceTrend(history,group);
    if(!trend || trend.direction!=="down") continue;
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
      dropPercent:drop,
      date:trend.latest.date,
      recordedAt:trend.latest.recordedAt
    });
  }
  return alerts.sort((a,b)=>b.dropPercent-a.dropPercent);
}

export function productHistory(history,{code,store=null,limit=12}={}) {
  return (history || [])
    .filter((item)=>String(item?.code)===String(code))
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
