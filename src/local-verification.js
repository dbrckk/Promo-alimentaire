export function confirmationKey({offerId,store,locationKey}={}){
  return [offerId||"",store||"",locationKey||""].join("|");
}

export function createStoreConfirmation(offer,{
  store,
  locationKey,
  locationName="",
  confirmedAt=new Date()
}={}){
  if(!offer?.id) throw new Error("Offre requise.");
  if(!store) throw new Error("Enseigne requise.");
  if(!locationKey || !/^(id|geo):/.test(locationKey)){
    throw new Error("Magasin physique précisément identifié requis.");
  }
  if(!Array.isArray(offer.eans) || offer.eans.length===0){
    throw new Error("EAN exact requis avant confirmation magasin.");
  }

  const date=new Date(confirmedAt);
  if(Number.isNaN(date.getTime())) throw new Error("Date de confirmation invalide.");
  if(!offerValidAt(offer,date)){
    throw new Error("Offre expirée, non démarrée ou à réviser : confirmation impossible.");
  }
  const maxUntil=new Date(date.getTime()+7*24*60*60*1000);
  const offerUntil=endOfOffer(offer.expiresAt);
  const reviewUntil=endOfOffer(offer.reviewAfter);
  const until=[maxUntil,offerUntil,reviewUntil].filter(Boolean)
    .reduce((earliest,next)=>next<earliest ? next : earliest);

  return {
    key:confirmationKey({offerId:offer.id,store,locationKey}),
    offerId:offer.id,
    offerFingerprint:offerFingerprint(offer),
    store,
    locationKey,
    locationName:String(locationName||""),
    confirmedAt:date.toISOString(),
    validUntil:until.toISOString()
  };
}

export function isStoreConfirmationActive(confirmation,offer,{
  store,
  locationKey,
  now=new Date()
}={}){
  if(!confirmation || !offer) return false;
  if(confirmation.offerId!==offer.id) return false;
  if(!confirmation.offerFingerprint || confirmation.offerFingerprint!==offerFingerprint(offer)) return false;
  if(confirmation.store!==store) return false;
  if(confirmation.locationKey!==locationKey) return false;
  if(!Array.isArray(offer.eans) || offer.eans.length===0) return false;

  const current=new Date(now);
  const confirmed=new Date(confirmation.confirmedAt);
  const until=new Date(confirmation.validUntil);
  if([current,confirmed,until].some((date)=>Number.isNaN(date.getTime()))) return false;
  if(current<confirmed || current>until) return false;

  if(!offerValidAt(offer,current)) return false;
  return true;
}

export function applyLocalStoreConfirmations(offers,confirmations,{
  store,
  locationKey,
  channel="store",
  now=new Date()
}={}){
  // A physical shelf/check-out check cannot validate a Drive or delivery order.
  if(channel!=="store") return offers || [];
  const byKey=new Map(
    (confirmations || []).map((entry)=>[entry.key || confirmationKey(entry),entry])
  );

  return (offers || []).map((offer)=>{
    if(offer?.requiresStoreVerification!==true) return offer;
    if(!locationKey) return offer;

    const key=confirmationKey({offerId:offer.id,store,locationKey});
    const confirmation=byKey.get(key);
    if(!isStoreConfirmationActive(confirmation,offer,{store,locationKey,now})) return offer;

    const loyaltyReady=!offer.requiresLoyalty || offer.loyaltyEligibility==="eligible";
    const priceReady=offer.requiresChannelPriceVerification!==true
      || offer.channelPriceVerified===true;
    const canApply=loyaltyReady && priceReady;
    return {
      ...offer,
      storeVerified:true,
      localVerification:confirmation,
      autoStack:canApply,
      stackingConfidence:canApply ? "high" : offer.stackingConfidence
    };
  });
}

export function pruneStoreConfirmations(confirmations,now=new Date()){
  const current=new Date(now);
  if(Number.isNaN(current.getTime())) return [];
  return (confirmations || []).filter((entry)=>{
    const until=new Date(entry?.validUntil);
    return !Number.isNaN(until.getTime()) && until>=current;
  });
}

function offerValidAt(offer,date){
  const start=offer.startsAt
    ? new Date(String(offer.startsAt).length===10
        ? offer.startsAt+"T00:00:00.000Z" : offer.startsAt)
    : null;
  if(start && (Number.isNaN(start.getTime()) || date<start)) return false;
  for(const field of ["expiresAt","reviewAfter"]){
    if(!offer[field]) continue;
    const until=endOfOffer(offer[field]);
    if(!until || date>until) return false;
  }
  return true;
}

function endOfOffer(value){
  if(!value) return null;
  const raw=String(value);
  const date=new Date(raw.length===10 ? raw+"T23:59:59.999Z" : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}


export function offerFingerprint(offer){
  if(!offer || !Array.isArray(offer.eans) || !offer.eans.length) return null;
  return JSON.stringify({
    id:offer.id,
    eans:[...new Set(offer.eans.map(String))].sort(),
    expiresAt:offer.expiresAt || null,
    startsAt:offer.startsAt || null,
    savingPercent:offer.savingPercent ?? null,
    savingAmount:offer.savingAmount ?? null,
    promoFormula:offer.promoFormula || null,
    requiresLoyalty:offer.requiresLoyalty || null,
    sourceUrl:offer.sourceUrl || null,
    eanEvidenceUrl:offer.eanEvidenceUrl || null,
    channels:[...(offer.channels || [])].map(String).sort(),
    stores:[...(offer.stores || [])].map(String).sort(),
    minPurchaseQty:offer.minPurchaseQty ?? null,
    stackGroup:offer.stackGroup || null,
    savingBasis:offer.savingBasis || null,
    stacking:offer.stacking || null,
    conditions:offer.conditions || null,
    requiresChannelPriceVerification:offer.requiresChannelPriceVerification===true,
    reviewAfter:offer.reviewAfter || null,
    sourcePromoPrice:offer.sourcePromoPrice ?? null,
    sourceRegularPrice:offer.sourceRegularPrice ?? null
  });
}
