import { isOfferActive, parisCivilDay, shopmiumLegacyReviewCutoff, validateImportBatch } from "./ingestion.js";
import {inspectImportManifest} from "./import-manifest.js";
import {endOfOffer} from "./local-verification.js";

// A failed refresh is NOT a new expiry date or proof that an old offer is
// false. Keep it visible as a candidate, but never silently count its
// previous automatic discount as reconfirmed.
function failedRefreshWarning(offer,syncSources,now){
  const sync=syncSources?.[offer?.providerId];
  if(!["unavailable","partial"].includes(sync?.status)) return null;
  const checked=new Date(sync.checkedAt);
  const current=new Date(now);
  const stamp=String(offer?.verifiedAt||"");
  const verified=new Date(stamp.length===10 ? stamp+"T00:00:00Z" : stamp);
  if([checked,current,verified].some((date)=>!Number.isFinite(date.getTime()))
    || checked>current || checked<=verified) return null;
  return {
    status:sync.status,
    checkedAt:checked.toISOString(),
    reason:String(sync.reason || "Offres non reconfirmées sur la source officielle").slice(0,220)
  };
}


export async function loadImportedOffers({fetchImpl=fetch,now=new Date()}={}) {
  // Use abortable requests so a stalled CDN cannot freeze Android startup.
  // Keep a small connection pool to avoid saturating mobile networks.
  const readJSON=async(url,timeoutMs)=>{
    const response=await fetchImpl(url,{
      headers:{Accept:"application/json"},
      signal:AbortSignal.timeout(timeoutMs)
    });
    if(!response.ok) throw new Error("HTTP "+response.status);
    return response.json();
  };
  const manifestUrl=new URL("../data/import/index.json",import.meta.url);
  let manifest;
  try{
    manifest=await readJSON(manifestUrl,8000);
  }catch(error){
    throw new Error("Manifest d'offres indisponible : "+error.message);
  }
  const checkedManifest=inspectImportManifest(manifest);
  if(!checkedManifest.ok){
    throw new Error("Manifeste d'offres refusé : "+checkedManifest.issues.join(" "));
  }
  const syncSources={};
  // Load shared legacy status first, then provider-specific files. The latter win
  // when both contain the same supplier, avoiding concurrent Git writes.
  const syncFiles=[
    "source-sync-status.json",
    "source-sync-carrefour.json",
    "source-sync-leclerc.json",
    "source-sync-shopmium.json"
  ];
  const syncResults=await Promise.all(syncFiles.map(async(file)=>{
    try{
      return await readJSON(new URL("../data/import/"+file,import.meta.url),5000);
    }catch{
      // Diagnostics are optional; never make offer validity depend on them.
      return null;
    }
  }));
  // Apply statuses in a stable order: provider-specific files override the
  // shared legacy status even if requests finish in another order.
  for(const data of syncResults){
    if(data?.sources && typeof data.sources==="object" && !Array.isArray(data.sources)){
      Object.assign(syncSources,data.sources);
    }
  }
  const files=checkedManifest.files;
  const imported=[];
  const errors=[];
  const sourceStats=[];
  const ids=new Set();

  // Up to three simultaneous downloads; commit the validated results below
  // in manifest order to preserve collision handling and source summaries.
  const downloaded=new Array(files.length);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(3,files.length)},async()=>{
    while(cursor<files.length){
      const index=cursor++;
      try{
        downloaded[index]={
          payload:await readJSON(new URL("../data/import/"+files[index],import.meta.url),9000)
        };
      }catch(error){
        downloaded[index]={error};
      }
    }
  }));

  for(const [index,file] of files.entries()){
    try{
      if(downloaded[index].error) throw downloaded[index].error;
      const payload=downloaded[index].payload;
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
      // A newer date on an expired offer cannot be advertised as the
      // latest proof among the active catalog.
      const verifiedDates=activeOffers.map((offer)=>offer.verifiedAt).filter(Boolean).sort();
      // Count only offers still active, using the very same inclusive
      // Europe/Paris civil deadlines as store confirmations and offer validity.
      // A source review on 12/10 ends at 23:59:59.999 Paris, not UTC.
      const deadlines=activeOffers
        .map((offer)=>{
          const legacyReview=shopmiumLegacyReviewCutoff(offer);
          const candidates=[
            endOfOffer(offer.reviewAfter),
            endOfOffer(offer.expiresAt),
            legacyReview ? endOfOffer(legacyReview.toISOString().slice(0,10)) : null
          ].filter((date)=>date && Number.isFinite(date.getTime()));
          return candidates.sort((a,b)=>a-b)[0] || null;
        })
        .filter((date)=>date && date>=now)
        .sort((a,b)=>a-b);
      const nextDeadline=deadlines[0] || null;
      const nextDeadlineDay=nextDeadline ? parisCivilDay(nextDeadline) : null;
      const todayParis=parisCivilDay(now);
      // "jours restants" is a difference between French *calendar days*,
      // not a 24-hour duration (DST makes some civil days 23/25 hours).
      const daysUntil=nextDeadlineDay && todayParis
        ? Math.round((Date.parse(nextDeadlineDay+"T12:00:00Z")
          -Date.parse(todayParis+"T12:00:00Z"))/(24*60*60*1000))
        : null;
      const validityStatus=activeOffers.length===0
        ? "stale" : daysUntil!==null && daysUntil<=3 ? "review-soon" : "ok";
      sourceStats.push({
        file,
        mode:/auto\.json$/i.test(file) ? "automatic" : "manual",
        status:validityStatus,
        validityStatus,
        daysUntil,
        activeCount:activeOffers.length,
        totalCount:result.normalized.length,
        providerIds,
        exactEanCount,
        heuristicCount,
        resolutionBlockedCount,
        storeVerificationCount,
        latestVerifiedAt:verifiedDates.at(-1) || null,
        nextDeadline:nextDeadlineDay
      });
      for(const offer of result.normalized){
        if(ids.has(offer.id)){
          errors.push({file,issues:[{errors:[`Identifiant dupliqué entre fichiers : ${offer.id}`]}]});
          continue;
        }
        ids.add(offer.id);
        if(!isOfferActive(offer,now)) continue;
        const failedRefresh=failedRefreshWarning(offer,syncSources,now);
        imported.push(failedRefresh ? {
          ...offer,
          // Card presence must not re-enable an auto discount based on a
          // supplier feed that failed its latest verification.
          autoStack:false,
          autoStackWhenEligible:false,
          sourceSyncWarning:failedRefresh
        } : offer);
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
      reason:String(sync.reason || "Actualisation publique indisponible").slice(0,220),
      confirmedCount:Number.isInteger(sync.extractedCount) && sync.extractedCount>=0
        ? sync.extractedCount : null,
      previousSnapshotCount:Number.isInteger(sync.previousSnapshotCount) && sync.previousSnapshotCount>=0
        ? sync.previousSnapshotCount : null
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
