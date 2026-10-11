export function summarizeBasketStrategies(scenarios,{
  channel="store",
  nearbyEnabled=false
}={}){
  const values=(scenarios || []).filter((scenario)=>scenario?.distinctCount>0);

  if(channel!=="store"){
    return {
      status:"indicative",
      reason:"Les prix observés proviennent de magasins physiques et ne permettent pas de comparer fiablement ce canal."
    };
  }
  if(!nearbyEnabled){
    return {
      status:"needs-location",
      reason:"Active la proximité pour comparer des points de vente du même secteur."
    };
  }

  const reliable=values.filter((scenario)=>
    scenario.isComplete===true
    && scenario.locationReliable===true
    && scenario.priceChannelReliable===true
    && Number.isInteger(scenario.pricedCount)
    && scenario.pricedCount===scenario.distinctCount
    && Number(scenario.missingCount)===0
    && Number.isFinite(scenario.finalCost) && scenario.finalCost>=0
    && Number.isFinite(scenario.guaranteedSaving) && scenario.guaranteedSaving>=0
    && (scenario.conservativeBestCaseCost==null
      || (Number.isFinite(scenario.conservativeBestCaseCost)
        && scenario.conservativeBestCaseCost>=0))
  );
  // A single priced store is not a comparison. In particular, filtering out
  // an incomplete retailer must not make the remaining retailer a "winner".
  if(reliable.length!==2
    || !reliable.some((scenario)=>scenario.store==="carrefour")
    || !reliable.some((scenario)=>scenario.store==="leclerc")){
    return {
      status:"insufficient",
      reason:"Il faut deux paniers complets, avec prix valides et magasin identifié, pour comparer Carrefour et E.Leclerc."
    };
  }
  // Prices without an actual age, old observations and personal receipts
  // are useful for budgeting but do not establish a current store winner.
  if(reliable.some((scenario)=>
    !Number.isFinite(scenario.oldestPriceAgeDays)
    || scenario.oldestPriceAgeDays<0 || scenario.oldestPriceAgeDays>7
    || Number(scenario.manualPriceCount)>0
  )){
    return {
      status:"indicative",
      reason:"Prix trop ancien, date inconnue ou relevé personnel : impossible d'affirmer quel magasin est le moins cher aujourd'hui."
    };
  }

  const guaranteed=[...reliable].sort((a,b)=>a.finalCost-b.finalCost)[0];
  const prudent=[...reliable].sort((a,b)=>
    (a.conservativeBestCaseCost ?? a.finalCost)
    -(b.conservativeBestCaseCost ?? b.finalCost)
  )[0];

  return {
    status:"ready",
    guaranteed:{
      store:guaranteed.store,
      finalCost:guaranteed.finalCost,
      saving:guaranteed.guaranteedSaving,
      payment:guaranteed.basketOptimization?.selected
        ?.find((offer)=>offer.mechanism==="gift_card") || null,
      confidence:guaranteed.confidence?.score ?? null,
      candidateProductCount:guaranteed.lines
        ?.filter((line)=>line.bestProductCandidate).length || 0
    },
    prudent:{
      store:prudent.store,
      cost:prudent.conservativeBestCaseCost ?? prudent.finalCost,
      extraSaving:prudent.conservativePotentialExtraSaving || 0
    },
    sameStore:guaranteed.store===prudent.store
  };
}
