export function summarizeBasketStrategies(scenarios,{
  channel="store",
  nearbyEnabled=false,
  coverageIncomplete=false
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

  // A partial Open Prices search can omit a newer receipt or an entire
  // eligible point of sale. Complete *basket lines* are not sufficient
  // evidence of exhaustive retailer coverage. Budget and strategy must
  // agree that such results are only indicative.
  if(coverageIncomplete){
    return {
      status:"indicative",
      reason:"Recherche de prix incomplète (pages supplémentaires ou échec réseau) : aucune stratégie gagnante fiable ne peut être déclarée."
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
    !Number.isFinite(scenario.oldestPriceAgeExactDays)
    || scenario.oldestPriceAgeExactDays<0 || scenario.oldestPriceAgeExactDays>7
    || Number(scenario.manualPriceCount)>0
  )){
    return {
      status:"indicative",
      reason:"Prix trop ancien, date inconnue ou relevé personnel : impossible d'affirmer quel magasin est le moins cher aujourd'hui."
    };
  }

  // A 50 km radius around a town may contain stores 100 km apart.
  // Comparing those as a "local winner" is misleading even when every
  // product has a fresh receipt. Only enforce this when both precise store
  // positions are known; a missing coordinate is handled separately by
  // the caller's location reliability checks.
  const [first,second]=reliable;
  const firstPoint=first.location;
  const secondPoint=second.location;
  const valid=(point)=>point
    && Number.isFinite(point.latitude) && Math.abs(point.latitude)<=90
    && Number.isFinite(point.longitude) && Math.abs(point.longitude)<=180;
  if(valid(firstPoint) && valid(secondPoint)){
    const radians=(degrees)=>degrees*Math.PI/180;
    const dLat=radians(secondPoint.latitude-firstPoint.latitude);
    const dLon=radians(secondPoint.longitude-firstPoint.longitude);
    const hav=Math.sin(dLat/2)**2
      +Math.cos(radians(firstPoint.latitude))
      *Math.cos(radians(secondPoint.latitude))
      *Math.sin(dLon/2)**2;
    const distanceKm=6371*2*Math.asin(Math.min(1,Math.sqrt(Math.max(0,hav))));
    if(distanceKm>15){
      return {
        status:"indicative",
        reason:"Les deux magasins retenus sont éloignés de plus de 15 km "+
          "l'un de l'autre : les prix restent indicatifs, sans gagnant local."
      };
    }
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
