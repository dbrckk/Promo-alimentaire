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
    scenario.isComplete
    && scenario.locationReliable
    && scenario.priceChannelReliable!==false
  );
  if(!reliable.length){
    return {
      status:"insufficient",
      reason:"Aucun scénario complet et suffisamment identifié n’est disponible."
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
