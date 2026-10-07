import { roundMoney } from "./domain.js";

export function optimizeStack(basePrice,offers,{store}={}) {
  const price=Number(basePrice);
  if(!Number.isFinite(price) || price<=0) {
    return {basePrice:0,finalCost:0,totalSaving:0,savingPercent:0,selected:[],considered:[]};
  }
  const considered=offers.filter((offer)=>isApplicable(offer,store));
  const candidates=considered.filter((offer)=>offer.autoStack===true);
  let best=evaluateSelection(price,[]);

  search(0,[]);
  return {...best,considered};

  function search(index,selection){
    if(index>=candidates.length){
      if(!isCompatible(selection)) return;
      const evaluated=evaluateSelection(price,selection);
      if(evaluated.totalSaving>best.totalSaving) best=evaluated;
      return;
    }
    search(index+1,selection);
    selection.push(candidates[index]);
    if(isCompatible(selection)) search(index+1,selection);
    selection.pop();
  }
}

export function isCompatible(selection) {
  const groups=new Set();
  const ids=new Set(selection.map((offer)=>offer.id));
  for(const offer of selection){
    if(offer.stackGroup){
      if(groups.has(offer.stackGroup)) return false;
      groups.add(offer.stackGroup);
    }
    if((offer.exclusiveWith || []).some((id)=>ids.has(id))) return false;
  }
  return true;
}

function isApplicable(offer,store){
  return (!store || offer.stores?.includes(store) || offer.stores?.includes("all"))
    && (Number.isFinite(offer.savingPercent) || Number.isFinite(offer.savingAmount));
}

function evaluateSelection(basePrice,selection){
  let effectiveCost=basePrice;
  const applied=[];
  const ordered=[...selection].sort((a,b)=>(a.stackOrder ?? 50)-(b.stackOrder ?? 50));
  for(const offer of ordered){
    const basis=offer.savingBasis==="base" ? basePrice : effectiveCost;
    const raw=Number.isFinite(offer.savingAmount)
      ? Number(offer.savingAmount)
      : basis*(Number(offer.savingPercent)/100);
    const saving=Math.max(0,Math.min(effectiveCost,raw));
    if(saving<=0) continue;
    effectiveCost-=saving;
    applied.push({...offer,calculatedSaving:roundMoney(saving)});
  }
  const finalCost=roundMoney(effectiveCost);
  const totalSaving=roundMoney(basePrice-finalCost);
  return {
    basePrice:roundMoney(basePrice),
    finalCost,
    totalSaving,
    savingPercent:Math.round((totalSaving/basePrice)*10000)/100,
    selected:applied
  };
}
