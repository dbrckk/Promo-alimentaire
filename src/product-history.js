export function addPriceObservation(history,{
  product,
  store,
  observation,
  recordedAt=new Date()
}={}, {limitPerProduct=30}={}) {
  if(!product?.code || !store || !observation || !Number.isFinite(Number(observation.price))) {
    return Array.isArray(history) ? history : [];
  }

  const entry={
    id:priceEntryId(product.code,store,observation),
    recordedAt:new Date(recordedAt).toISOString(),
    code:String(product.code),
    name:product.name || "Produit",
    store,
    price:Number(observation.price),
    date:observation.date || null,
    locationId:observation.locationId ?? null,
    storeName:observation.storeName || "",
    city:observation.city || "",
    postcode:observation.postcode || "",
    isDiscounted:Boolean(observation.isDiscounted)
  };

  const values=Array.isArray(history) ? history : [];
  const deduped=values.filter((item)=>item.id!==entry.id);
  const merged=[entry,...deduped];
  const counts=new Map();
  return merged.filter((item)=>{
    const key=`${item.code}|${item.store}`;
    const count=counts.get(key) || 0;
    if(count>=limitPerProduct) return false;
    counts.set(key,count+1);
    return true;
  }).slice(0,500);
}

export function productPriceTrend(history,{code,store,locationId=null}={}) {
  const values=(history || [])
    .filter((item)=>String(item.code)===String(code))
    .filter((item)=>!store || item.store===store)
    .filter((item)=>locationId===null || item.locationId===locationId)
    .sort((a,b)=>new Date(b.recordedAt)-new Date(a.recordedAt));

  if(values.length<2) return null;
  const latest=values[0];
  const previous=values.find((item)=>item.id!==latest.id && Number(item.price)!==Number(latest.price))
    || values[1];
  if(!previous) return null;

  const delta=round(Number(latest.price)-Number(previous.price));
  const percent=Number(previous.price)>0
    ? Math.round((delta/Number(previous.price))*10000)/100
    : 0;

  return {
    latest,
    previous,
    delta,
    percent,
    direction:delta<0?"down":delta>0?"up":"flat"
  };
}

export function detectPriceDrops(history,{thresholdPercent=10}={}) {
  const keys=new Set((history || []).map((item)=>`${item.code}|${item.store}`));
  const alerts=[];
  for(const key of keys){
    const [code,store]=key.split("|");
    const trend=productPriceTrend(history,{code,store});
    if(!trend || trend.direction!=="down") continue;
    const drop=Math.abs(trend.percent);
    if(drop<thresholdPercent) continue;
    alerts.push({
      code,
      store,
      name:trend.latest.name,
      latestPrice:trend.latest.price,
      previousPrice:trend.previous.price,
      dropPercent:drop,
      recordedAt:trend.latest.recordedAt
    });
  }
  return alerts.sort((a,b)=>b.dropPercent-a.dropPercent);
}

export function productHistory(history,{code,store=null,limit=12}={}) {
  return (history || [])
    .filter((item)=>String(item.code)===String(code))
    .filter((item)=>!store || item.store===store)
    .sort((a,b)=>new Date(b.recordedAt)-new Date(a.recordedAt))
    .slice(0,limit);
}

function priceEntryId(code,store,observation){
  return [
    code,
    store,
    observation.locationId ?? observation.storeName ?? "?",
    observation.date ?? "?",
    Number(observation.price).toFixed(4)
  ].join("|");
}

function round(value){
  return Math.round((Number(value)+Number.EPSILON)*100)/100;
}
