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
    .sort((a,b)=>a.finalCost-b.finalCost)[0] || null;

  return {
    id:historyId(createdAt,shoppingList,channel),
    createdAt:new Date(createdAt).toISOString(),
    channel,
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
  const values=(history || []).filter((entry)=>Number.isFinite(entry.bestFinalCost));
  if(values.length<2) return null;
  const latest=values[0];
  const previous=values[1];
  const delta=round(latest.bestFinalCost-previous.bestFinalCost);
  return {
    latest:latest.bestFinalCost,
    previous:previous.bestFinalCost,
    delta,
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

function historyId(date,shoppingList,channel="store"){
  const codes=(shoppingList || [])
    .map((item)=>`${item.product?.code || "?"}x${Number(item.quantity)||1}`)
    .sort()
    .join("|");
  const minute=new Date(date).toISOString().slice(0,16);
  return `${minute}:${channel}:${codes}`;
}

function round(value){
  return Math.round((Number(value)+Number.EPSILON)*100)/100;
}
