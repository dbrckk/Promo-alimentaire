import { findProductOffers, estimateOfferSaving } from "./matching.js";
import { selectBestRecentPrice } from "./open-data.js";
import { optimizeStack } from "./stacking.js";
import { roundMoney } from "./domain.js";

export function normalizeQuantity(value) {
  const quantity=Math.trunc(Number(value));
  if(!Number.isFinite(quantity) || quantity<1) return 1;
  return Math.min(quantity,99);
}

export function evaluateBasketStore(items,{
  store,
  priceByCode={},
  offers=[],
  now=new Date(),
  maxPriceAgeDays=120
}={}) {
  const lines=(items || []).map((item)=>{
    const quantity=normalizeQuantity(item.quantity);
    const observations=priceByCode[item.product?.code] || [];
    const best=selectBestRecentPrice(observations,maxPriceAgeDays,now);
    const matches=findProductOffers(item.product,offers,{store});

    if(!best){
      return {
        code:item.product?.code || "",
        product:item.product,
        quantity,
        bestPrice:null,
        baseCost:null,
        finalCost:null,
        guaranteedSaving:0,
        potentialProductSaving:null,
        matches,
        missingPrice:true
      };
    }

    const baseCost=roundMoney(best.price*quantity);
    const guaranteedProductOffers=matches
      .filter(({match,offer})=>match.exact && offer.autoStack===true)
      .map(({offer})=>offer);
    const lineOptimization=optimizeStack(baseCost,guaranteedProductOffers,{store});

    const potentialSavings=matches
      .map(({offer})=>estimateOfferSaving(best.price,offer,quantity))
      .filter(Number.isFinite)
      .map((saving)=>roundMoney(saving));
    const potentialProductSaving=potentialSavings.length ? Math.max(...potentialSavings) : null;

    return {
      code:item.product?.code || "",
      product:item.product,
      quantity,
      bestPrice:best,
      baseCost,
      finalCost:lineOptimization.finalCost,
      guaranteedSaving:lineOptimization.totalSaving,
      potentialProductSaving,
      matches,
      missingPrice:false
    };
  });

  const pricedLines=lines.filter((line)=>!line.missingPrice);
  const missingLines=lines.filter((line)=>line.missingPrice);
  const observedSubtotal=roundMoney(pricedLines.reduce((sum,line)=>sum+line.baseCost,0));
  const productAdjustedSubtotal=roundMoney(pricedLines.reduce((sum,line)=>sum+line.finalCost,0));
  const basketOffers=offers.filter((offer)=>offer.scope==="panier");
  const basketOptimization=productAdjustedSubtotal>0
    ? optimizeStack(productAdjustedSubtotal,basketOffers,{store})
    : {finalCost:0,totalSaving:0,selected:[],considered:[],savingPercent:0};

  const finalCost=roundMoney(basketOptimization.finalCost);
  const guaranteedSaving=roundMoney(observedSubtotal-finalCost);
  const potentialProductSaving=roundMoney(pricedLines.reduce(
    (sum,line)=>sum+(line.potentialProductSaving || 0),0
  ));

  return {
    store,
    lines,
    itemCount:lines.reduce((sum,line)=>sum+line.quantity,0),
    distinctCount:lines.length,
    pricedCount:pricedLines.length,
    missingCount:missingLines.length,
    isComplete:lines.length>0 && missingLines.length===0,
    observedSubtotal,
    productAdjustedSubtotal,
    basketOptimization,
    finalCost,
    guaranteedSaving,
    savingPercent:observedSubtotal>0
      ? Math.round((guaranteedSaving/observedSubtotal)*10000)/100
      : 0,
    potentialProductSaving
  };
}

export function compareBasketStores(scenarios) {
  const valid=(scenarios || []).filter((scenario)=>scenario && scenario.distinctCount>0);
  const complete=valid.filter((scenario)=>scenario.isComplete);
  if(complete.length){
    return [...complete].sort((a,b)=>a.finalCost-b.finalCost);
  }
  return [...valid].sort((a,b)=>{
    if(a.pricedCount!==b.pricedCount) return b.pricedCount-a.pricedCount;
    return a.finalCost-b.finalCost;
  });
}


export function observationLocationKey(observation) {
  if(!observation) return null;
  if(observation.locationId!==null && observation.locationId!==undefined) {
    return `id:${observation.locationId}`;
  }
  const lat=Number(observation.locationLat);
  const lon=Number(observation.locationLon);
  if(Number.isFinite(lat) && Number.isFinite(lon)) {
    return `geo:${lat.toFixed(5)},${lon.toFixed(5)}`;
  }
  const fallback=[
    observation.storeName,
    observation.postcode,
    observation.city
  ].map((value)=>String(value ?? "").trim().toLocaleLowerCase("fr")).filter(Boolean).join("|");
  return fallback ? `text:${fallback}` : null;
}

export function evaluateBasketLocations(items,{
  store,
  priceByCode={},
  offers=[],
  now=new Date(),
  maxPriceAgeDays=120
}={}) {
  const locations=new Map();

  for(const item of items || []){
    const code=item.product?.code;
    for(const observation of priceByCode[code] || []){
      const key=observationLocationKey(observation);
      if(!key) continue;
      if(!locations.has(key)){
        locations.set(key,{
          key,
          location:{
            id:observation.locationId ?? null,
            name:observation.storeName || "",
            city:observation.city || "",
            postcode:observation.postcode || "",
            distanceKm:Number.isFinite(observation.distanceKm) ? observation.distanceKm : null
          },
          priceByCode:{}
        });
      }
      const entry=locations.get(key);
      if(!entry.priceByCode[code]) entry.priceByCode[code]=[];
      entry.priceByCode[code].push(observation);
      if(Number.isFinite(observation.distanceKm)){
        if(!Number.isFinite(entry.location.distanceKm) || observation.distanceKm<entry.location.distanceKm){
          entry.location.distanceKm=observation.distanceKm;
        }
      }
    }
  }

  return [...locations.values()].map((entry)=>({
    ...evaluateBasketStore(items,{
      store,
      priceByCode:entry.priceByCode,
      offers,
      now,
      maxPriceAgeDays
    }),
    locationKey:entry.key,
    location:entry.location
  }));
}

export function selectBestLocationScenario(scenarios) {
  const values=(scenarios || []).filter(Boolean);
  if(!values.length) return null;
  const complete=values.filter((scenario)=>scenario.isComplete);
  const pool=complete.length ? complete : values;
  return [...pool].sort((a,b)=>{
    if(a.isComplete!==b.isComplete) return a.isComplete ? -1 : 1;
    if(a.pricedCount!==b.pricedCount) return b.pricedCount-a.pricedCount;
    if(a.finalCost!==b.finalCost) return a.finalCost-b.finalCost;
    const da=Number.isFinite(a.location?.distanceKm) ? a.location.distanceKm : Infinity;
    const db=Number.isFinite(b.location?.distanceKm) ? b.location.distanceKm : Infinity;
    return da-db;
  })[0];
}
