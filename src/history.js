const DEFAULT_LIMIT=20;

export function createHistoryEntry({
  scenarios=[],
  shoppingList=[],
  radiusKm=null,
  nearbyEnabled=false,
  channel="store",
  createdAt=new Date()
}={}) {
  const best=[...scenarios]
    .filter((scenario)=>scenario?.isComplete && scenario?.locationReliable && scenario?.priceChannelReliable!==false)
    .filter((scenario)=>scenarioLocationIdentity(scenario)!==null)
    .sort((a,b)=>a.finalCost-b.finalCost)[0] || null;
  const basketSignature=basketContentSignature(shoppingList);
  const contextKey=historyContextKey({
    basketSignature,channel,nearbyEnabled,radiusKm,
    bestStore:best?.store || null,
    bestLocationKey:best ? scenarioLocationIdentity(best) : null
  });

  return {
    id:historyId(createdAt,shoppingList,channel,contextKey),
    createdAt:new Date(createdAt).toISOString(),
    channel,
    basketSignature,
    contextKey,
    bestLocationKey:best ? scenarioLocationIdentity(best) : null,
    nearbyEnabled:Boolean(nearbyEnabled),
    radiusKm:nearbyEnabled ? Number(radiusKm)||null : null,
    itemCount:shoppingList.reduce((sum,item)=>sum+(Number(item.quantity)||1),0),
    distinctCount:shoppingList.length,
    products:shoppingList.map((item)=>({
      code:item.product?.code || "",
      name:item.product?.name || "Produit",
      quantity:Number(item.quantity)||1
    })),
    scenarios:scenarios.map(compactScenario),
    bestStore:best?.store || null,
    bestFinalCost:best?.finalCost ?? null
  };
}

export function addHistoryEntry(history,entry,{limit=DEFAULT_LIMIT}={}) {
  const values=Array.isArray(history) ? history : [];
  const deduped=values.filter((item)=>item.id!==entry.id);
  return [entry,...deduped].slice(0,Math.max(1,limit));
}

export function historyTrend(history) {
  // Only compare the same basket, purchase channel, radius and physical store.
  // Legacy entries without a context key cannot establish a reliable trend.
  const values=(history || [])
    .filter((entry)=>Number.isFinite(entry?.bestFinalCost))
    .filter((entry)=>entry?.nearbyEnabled===true && entry?.channel==="store")
    .filter((entry)=>Boolean(entry?.basketSignature && entry?.contextKey && entry?.bestLocationKey))
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  if(values.length<2) return null;
  const latest=values[0];
  const previous=values.find((entry)=>
    entry.id!==latest.id
    && entry.contextKey===latest.contextKey
    && new Date(entry.createdAt)<new Date(latest.createdAt)
  );
  if(!previous) return null;
  const delta=round(latest.bestFinalCost-previous.bestFinalCost);
  return {
    latest:latest.bestFinalCost,
    previous:previous.bestFinalCost,
    delta,
    store:latest.bestStore,
    locationKey:latest.bestLocationKey,
    direction:delta<0 ? "down" : delta>0 ? "up" : "flat"
  };
}

function compactScenario(scenario){
  return {
    store:scenario.store,
    locationName:scenario.location?.name || "",
    city:scenario.location?.city || "",
    postcode:scenario.location?.postcode || "",
    locationReliable:Boolean(scenario.locationReliable),
    priceChannelReliable:scenario.priceChannelReliable!==false,
    channel:scenario.channel || "store",
    isComplete:Boolean(scenario.isComplete),
    pricedCount:Number(scenario.pricedCount)||0,
    distinctCount:Number(scenario.distinctCount)||0,
    observedSubtotal:Number(scenario.observedSubtotal)||0,
    guaranteedSaving:Number(scenario.guaranteedSaving)||0,
    finalCost:Number(scenario.finalCost)||0,
    confidence:Number(scenario.confidence?.score)||0
  };
}

export function basketContentSignature(shoppingList=[]){
  const quantities=new Map();
  for(const item of shoppingList || []){
    const code=String(item?.product?.code || "").trim();
    const quantity=Math.trunc(Number(item?.quantity));
    if(!code || !Number.isFinite(quantity) || quantity<1) return null;
    quantities.set(code,(quantities.get(code) || 0)+quantity);
  }
  if(!quantities.size) return null;
  return [...quantities].sort(([a],[b])=>a.localeCompare(b))
    .map(([code,quantity])=>code+"x"+quantity).join("|");
}

function scenarioLocationIdentity(scenario){
  const id=scenario?.location?.id;
  if(id!==null && id!==undefined && String(id).trim()){
    return "id:"+String(id).trim();
  }
  const name=String(scenario?.location?.name || "").trim().toLocaleLowerCase("fr");
  const postcode=String(scenario?.location?.postcode || "").trim();
  if(!name || !/^\d{5}$/.test(postcode)) return null;
  return "named:"+name+"|"+postcode;
}

function historyContextKey({basketSignature,channel,nearbyEnabled,radiusKm,bestStore,bestLocationKey}){
  if(!basketSignature || !nearbyEnabled || channel!=="store" || !bestStore || !bestLocationKey){
    return null;
  }
  const radius=Number(radiusKm);
  if(!Number.isFinite(radius) || radius<=0) return null;
  return JSON.stringify([basketSignature,channel,radius,bestStore,bestLocationKey]);
}

function historyId(date,shoppingList,channel="store",contextKey=null){
  const codes=(shoppingList || [])
    .map((item)=>`${item.product?.code || "?"}x${Number(item.quantity)||1}`)
    .sort()
    .join("|");
  const minute=new Date(date).toISOString().slice(0,16);
  return `${minute}:${channel}:${codes}:${contextKey || "no-context"}`;
}

function round(value){
  return Math.round((Number(value)+Number.EPSILON)*100)/100;
}
