import { isOfferActive, validateImportBatch } from "./ingestion.js";

export async function loadImportedOffers({fetchImpl=fetch,now=new Date()}={}) {
  const manifestUrl=new URL("../data/import/index.json",import.meta.url);
  const manifestResponse=await fetchImpl(manifestUrl,{headers:{Accept:"application/json"}});
  if(!manifestResponse.ok) {
    throw new Error(`Manifest d'offres indisponible (${manifestResponse.status}).`);
  }
  const manifest=await manifestResponse.json();
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
          providerIds:[],latestVerifiedAt:null,nextDeadline:null
        });
        continue;
      }
      const activeOffers=result.normalized.filter((offer)=>isOfferActive(offer,now));
      const providerIds=[...new Set(result.normalized.map((offer)=>offer.providerId).filter(Boolean))];
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
        latestVerifiedAt:null,nextDeadline:null
      });
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

export function mergeOffers(baseOffers,importedOffers) {
  const map=new Map();
  for(const offer of [...(baseOffers || []),...(importedOffers || [])]){
    if(!offer?.id) continue;
    map.set(offer.id,offer);
  }
  return [...map.values()];
}
