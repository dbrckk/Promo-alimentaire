import { isOfferActive, validateImportBatch } from "./ingestion.js";

export async function loadImportedOffers({fetchImpl=fetch,now=new Date()}={}) {
  const manifestUrl=new URL("../data/import/index.json",import.meta.url);
  const manifestResponse=await fetchImpl(manifestUrl,{headers:{Accept:"application/json"}});
  if(!manifestResponse.ok) {
    throw new Error(`Manifest d'offres indisponible (${manifestResponse.status}).`);
  }
  const manifest=await manifestResponse.json();
  const syncSources={};
  // Load shared legacy status first, then provider files. The latter win
  // when both contain the same supplier, avoiding concurrent Git writes.
  for(const file of [
    "source-sync-status.json",
    "source-sync-carrefour.json",
    "source-sync-leclerc.json"
  ]){
    try{
      const url=new URL("../data/import/"+file,import.meta.url);
      const response=await fetchImpl(url,{headers:{Accept:"application/json"}});
      if(!response.ok) continue;
      const data=await response.json();
      if(data?.sources && typeof data.sources==="object" && !Array.isArray(data.sources)){
        Object.assign(syncSources,data.sources);
      }
    }catch{
      // Diagnostics are optional; never make offer validity depend on them.
    }
  }
  const files=Array.isArray(manifest?.files) ? manifest.files : [];
  const imported=[];
  const errors=[];
  const sourceStats=[];
  const ids=new Set();

  for(const file of files){
    const url=new URL(`../data/import/${file}`,import.meta.url);
    try{
      const response=await fetchImpl(url,{headers:{Accept:"application/json"}});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload=await response.json();
      const records=Array.isArray(payload) ? payload : payload?.offers;
      const result=validateImportBatch(records);
      if(!result.ok){
        errors.push({file,issues:result.errors});
        sourceStats.push({
          file,mode:/auto\.json$/i.test(file) ? "automatic" : "manual",
          status:"error",activeCount:0,totalCount:Array.isArray(records)?records.length:0,
          providerIds:[],exactEanCount:0,heuristicCount:0,
          resolutionBlockedCount:0,storeVerificationCount:0,
          latestVerifiedAt:null,nextDeadline:null
        });
        continue;
      }
      const activeOffers=result.normalized.filter((offer)=>isOfferActive(offer,now));
      const providerIds=[...new Set(result.normalized.map((offer)=>offer.providerId).filter(Boolean))];
      const exactEanCount=activeOffers.filter((offer)=>
        Array.isArray(offer.eans) && offer.eans.length>0
      ).length;
      const heuristicCount=activeOffers.filter((offer)=>
        (!Array.isArray(offer.eans) || offer.eans.length===0)
        && Boolean(offer.productMatch)
      ).length;
      const resolutionBlockedCount=activeOffers.filter((offer)=>
        offer.eanResolutionBlocked===true
      ).length;
      const storeVerificationCount=activeOffers.filter((offer)=>
        offer.requiresStoreVerification===true
      ).length;
      const verifiedDates=result.normalized.map((offer)=>offer.verifiedAt).filter(Boolean).sort();
      const deadlines=result.normalized
        .flatMap((offer)=>[offer.reviewAfter,offer.expiresAt].filter(Boolean))
        .map((value)=>new Date(String(value).length===10 ? value+"T23:59:59Z" : value))
        .filter((date)=>!Number.isNaN(date.getTime()) && date>=now)
        .sort((a,b)=>a-b);
      const nextDeadline=deadlines[0] || null;
      const daysUntil=nextDeadline ? Math.ceil((nextDeadline-now)/(24*60*60*1000)) : null;
      sourceStats.push({
        file,
        mode:/auto\.json$/i.test(file) ? "automatic" : "manual",
        status:activeOffers.length===0 ? "stale" : daysUntil!==null && daysUntil<=3 ? "review-soon" : "ok",
        activeCount:activeOffers.length,
        totalCount:result.normalized.length,
        providerIds,
        exactEanCount,
        heuristicCount,
        resolutionBlockedCount,
        storeVerificationCount,
        latestVerifiedAt:verifiedDates.at(-1) || null,
        nextDeadline:nextDeadline?.toISOString().slice(0,10) || null
      });
      for(const offer of result.normalized){
        if(ids.has(offer.id)){
          errors.push({file,issues:[{errors:[`Identifiant dupliqué entre fichiers : ${offer.id}`]}]});
          continue;
        }
        ids.add(offer.id);
        if(isOfferActive(offer,now)) imported.push(offer);
      }
    }catch(error){
      errors.push({file,issues:[{errors:[error.message]}]});
      sourceStats.push({
        file,mode:/auto\.json$/i.test(file) ? "automatic" : "manual",
        status:"error",activeCount:0,totalCount:0,providerIds:[],
        exactEanCount:0,heuristicCount:0,resolutionBlockedCount:0,
        storeVerificationCount:0,latestVerifiedAt:null,nextDeadline:null
      });
    }
  }

  for(const stat of sourceStats){
    const sync=(stat.providerIds || [])
      .map((providerId)=>syncSources[providerId])
      .find((entry)=>["unavailable","partial"].includes(entry?.status)
        && typeof entry.checkedAt==="string"
        && Number.isFinite(new Date(entry.checkedAt).getTime()));
    if(!sync) continue;
    stat.syncState={
      status:sync.status,
      checkedAt:sync.checkedAt,
      reason:String(sync.reason || "Actualisation publique indisponible").slice(0,220)
    };
    // Do not change dates/active offer counts; show a distinct warning.
    if(stat.status==="ok" || stat.status==="review-soon"){
      stat.status="sync-warning";
    }
  }

  return {
    offers:imported,
    errors,
    manifestVerifiedAt:manifest?.verifiedAt || null,
    fileCount:files.length,
    sourceStats
  };
}

export function offerIdentity(offer){
  if(!offer?.id) return "";
  const scope=offer.scope;
  const mechanism=offer.mechanism;
  const providerId=offer.providerId;
  // Static payment fallbacks must yield to a newer public payment snapshot,
  // but different product promotions/ODRs must never be collapsed by heuristics.
  if(scope==="panier" && providerId
    && ["gift_card","card_cashback","affiliate_cashback"].includes(mechanism)){
    const stores=[...(offer.stores || [])].map(String).sort().join(",");
    const channels=[...(offer.channels || [])].map(String).sort().join(",");
    if(stores && channels) return [
      "payment",providerId,mechanism,stores,channels
    ].join("|");
  }
  return String(offer.id);
}

export function mergeOffers(baseOffers,importedOffers) {
  const map=new Map();
  for(const offer of [...(baseOffers || []),...(importedOffers || [])]){
    if(!offer?.id) continue;
    map.set(offerIdentity(offer),offer);
  }
  return [...map.values()];
}
