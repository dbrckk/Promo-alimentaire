import { matchOfferToProduct } from "./matching.js";

export function matchBundle(items,offer) {
  const requirements=Array.isArray(offer?.bundleRequirements) ? offer.bundleRequirements : [];
  if(offer?.scope!=="bundle" || requirements.length<2) return {matched:false,matches:[]};

  const candidates=(items || []).map((item,index)=>({
    item,
    index,
    quantity:Math.max(1,Math.trunc(Number(item?.quantity)||1))
  }));

  const matches=[];
  const usedIndexes=new Set();

  for(const requirement of requirements){
    let found=null;
    for(const candidate of candidates){
      if(usedIndexes.has(candidate.index)) continue;
      if(candidate.quantity<(requirement.minQty || 1)) continue;
      const match=matchOfferToProduct(candidate.item?.product,{
        scope:"produit",
        productMatch:requirement.productMatch
      });
      if(match.matched){
        found={requirement,item:candidate.item,index:candidate.index,match};
        break;
      }
    }
    if(!found) return {matched:false,matches:[]};
    usedIndexes.add(found.index);
    matches.push(found);
  }

  return {matched:true,matches};
}

export function estimateBundleSaving(items,lines,offer) {
  const bundle=matchBundle(items,offer);
  if(!bundle.matched) return null;
  const target=bundle.matches.find(
    (entry)=>entry.requirement.id===offer.bundleTargetRequirementId
  );
  if(!target) return null;

  const targetLine=(lines || []).find(
    (line)=>String(line.product?.code || line.code)===String(target.item?.product?.code || "")
      && !line.missingPrice
      && line.bestPrice
  );
  if(!targetLine) return null;

  const targetUnits=Math.max(1,Math.min(
    Math.trunc(Number(target.item.quantity)||1),
    Math.trunc(Number(target.requirement.minQty)||1)
  ));
  const unitPrice=Number(targetLine.bestPrice.price);
  if(!Number.isFinite(unitPrice) || unitPrice<=0) return null;

  let saving=null;
  if(Number.isFinite(offer.savingAmount)){
    saving=Number(offer.savingAmount);
  }else if(Number.isFinite(offer.savingPercent)){
    saving=unitPrice*targetUnits*(Number(offer.savingPercent)/100);
  }
  if(!Number.isFinite(saving)) return null;
  if(Number.isFinite(offer.savingCapAmount)){
    saving=Math.min(saving,Number(offer.savingCapAmount));
  }

  return {
    saving:round(Math.max(0,saving)),
    offer,
    targetLine,
    bundle
  };
}

export function findBundleCandidates(items,lines,offers,{store,channel=null}={}) {
  return (offers || [])
    .filter((offer)=>offer.scope==="bundle")
    .filter((offer)=>!store || offer.stores?.includes(store) || offer.stores?.includes("all"))
    .filter((offer)=>{
      const channels=Array.isArray(offer.channels) ? offer.channels : [];
      return !channel || channels.length===0 || channels.includes(channel) || channels.includes("all");
    })
    .map((offer)=>estimateBundleSaving(items,lines,offer))
    .filter(Boolean)
    .sort((a,b)=>b.saving-a.saving);
}

function round(value){
  return Math.round((Number(value)+Number.EPSILON)*100)/100;
}
