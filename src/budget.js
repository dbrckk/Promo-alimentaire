const MAX_BUDGET=10000;

export function parseShoppingBudget(value){
  if(value===null || value===undefined || value==="") return null;
  const raw=String(value).trim().replace(/\s/g,"").replace(",",".");
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const amount=Number(raw);
  if(!Number.isFinite(amount) || amount<0.01 || amount>MAX_BUDGET) return null;
  return Math.round(amount*100)/100;
}

export function evaluateShoppingBudget(scenarios,{
  budget,
  channel="store",
  nearbyEnabled=false,
  coverageIncomplete=false
}={}){
  const target=parseShoppingBudget(budget);
  if(target===null) return {configured:false,budget:null,results:[]};
  const results=(scenarios || []).filter(Boolean).map((scenario)=>{
    const store=String(scenario.store || "");
    const total=Number(scenario.checkoutCost);
    const complete=scenario.isComplete===true
      && Number(scenario.distinctCount)>0
      && Number(scenario.missingCount)===0;
    const pricedCount=Number(scenario.pricedCount)||0;
    const distinctCount=Number(scenario.distinctCount)||0;
    if(!pricedCount || !Number.isFinite(total) || total<0){
      return {
        store,status:"unavailable",checkoutCost:null,
        missingCount:distinctCount,difference:null,
        label:"Aucun prix exploitable pour ce panier."
      };
    }

    const checkoutCost=round(total);
    const difference=round(target-checkoutCost);
    const reasons=[];
    if(!complete){
      reasons.push("Prix manquants : le total n'est qu'un minimum partiel.");
    }
    if(channel!=="store" || scenario.priceChannelReliable===false){
      reasons.push("Prix du canal d'achat non confirmé.");
    }
    if(!nearbyEnabled || scenario.locationReliable!==true){
      reasons.push("Magasin physique précis non confirmé.");
    }
    if(coverageIncomplete){
      reasons.push("Recherche de prix incomplète.");
    }
    if(Number(scenario.manualPriceCount)>0){
      reasons.push("Présence de relevés personnels non vérifiés.");
    }

    let status;
    if(!complete){
      status=difference<0?"partial-over":"partial-unknown";
    }else if(reasons.length){
      status=difference<0?"indicative-over":"indicative-within";
    }else{
      status=difference<0?"over":"within";
    }

    return {
      store,
      status,
      checkoutCost,
      difference,
      missingCount:Math.max(0,Number(scenario.missingCount)||0),
      pricedCount,
      distinctCount,
      reliable:complete && reasons.length===0,
      reasons
    };
  });
  return {configured:true,budget:target,results};
}

function round(value){
  return Math.round((value+Number.EPSILON)*100)/100;
}
