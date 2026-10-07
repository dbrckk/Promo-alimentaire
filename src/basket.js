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
      .map(({offer})=>estimateOfferSaving(best.price,offer))
      .filter(Number.isFinite)
      .map((saving)=>roundMoney(saving*quantity));
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
