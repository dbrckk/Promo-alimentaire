import { offerEvidenceStatus } from "./evidence.js";

export function buildVerificationQueue(scenario,{loyaltyProfile={},limit=5}={}){
  const tasks=[];
  for(const line of scenario?.lines || []){
    if(line?.missingPrice) continue;
    // Prefer an unclaimed opportunity rather than displaying a discount
    // already applied automatically. A line can have multiple candidates.
    const appliedIds=new Set((line.appliedOffers || []).map((offer)=>offer.id));
    const candidates=Array.isArray(line.savingCandidates)
      ? line.savingCandidates
      : [line.bestSavingCandidate];
    const pending=candidates
      .filter((candidate)=>candidate?.offer && Number.isFinite(candidate.saving))
      .filter((candidate)=>!appliedIds.has(candidate.offer.id))
      .map((candidate)=>({
        candidate,
        additional:Math.round(Math.max(
          0,candidate.saving-(line.guaranteedSaving || 0)
        )*100)/100
      }))
      .filter(({additional})=>additional>=0.01)
      .sort((a,b)=>b.additional-a.additional)[0];
    if(!pending) continue;
    const {candidate,additional}=pending;
    const offer=candidate.offer;
    const evidence=offerEvidenceStatus(offer,{
      match:candidate.match,
      productCode:line.code || line.product?.code,
      loyaltyProfile,
      storeVerified:offer.storeVerified===true,
      channelPriceVerified:offer.channelPriceVerified===true
    });
    const blockers=[...evidence.blockers];
    if(offer.requiresStoreVerification && !scenario.locationReliable){
      blockers.unshift("Point de vente précis à identifier");
    }
    if(offer.autoStack!==true && evidence.canGuarantee){
      blockers.push("Conditions de cumul ou activation à confirmer");
    }
    if(offer.autoStack===true && !(line.appliedOffers || []).some(
      (applied)=>applied.id===offer.id
    )){
      blockers.push("Compatibilité avec les autres remises à vérifier");
    }

    tasks.push({
      code:String(line.code || line.product?.code || ""),
      name:line.product?.name || "Produit",
      quantity:line.quantity || 1,
      offerId:offer.id,
      provider:offer.provider || "",
      title:offer.title || "Offre",
      sourceUrl:offer.sourceUrl || null,
      exact:evidence.productExact,
      eligible:evidence.canGuarantee,
      blockers:[...new Set(blockers)],
      additionalSaving:additional,
      store:scenario.store,
      channel:scenario.channel || "store"
    });
  }
  tasks.sort((a,b)=>{
    if(a.additionalSaving!==b.additionalSaving) return b.additionalSaving-a.additionalSaving;
    if(a.exact!==b.exact) return a.exact ? -1 : 1;
    return a.name.localeCompare(b.name,"fr");
  });
  const max=Math.min(12,Math.max(1,Number.isFinite(limit)?Math.trunc(limit):5));
  return {
    totalCount:tasks.length,
    topSingleAdditionalSaving:tasks[0]?.additionalSaving || 0,
    items:tasks.slice(0,max)
  };
}
