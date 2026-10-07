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
  const maxUntil=new Date(date.getTime()+7*24*60*60*1000);
  const offerUntil=endOfOffer(offer.expiresAt);
  const until=offerUntil && offerUntil<maxUntil ? offerUntil : maxUntil;

  return {
    key:confirmationKey({offerId:offer.id,store,locationKey}),
    offerId:offer.id,
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
  if(confirmation.store!==store) return false;
  if(confirmation.locationKey!==locationKey) return false;
  if(!Array.isArray(offer.eans) || offer.eans.length===0) return false;

  const current=new Date(now);
  const confirmed=new Date(confirmation.confirmedAt);
  const until=new Date(confirmation.validUntil);
  if([current,confirmed,until].some((date)=>Number.isNaN(date.getTime()))) return false;
  if(current<confirmed || current>until) return false;

  const offerUntil=endOfOffer(offer.expiresAt);
  if(offerUntil && current>offerUntil) return false;
  return true;
}

export function applyLocalStoreConfirmations(offers,confirmations,{
  store,
  locationKey,
  now=new Date()
}={}){
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
    return {
      ...offer,
      storeVerified:true,
      localVerification:confirmation,
      autoStack:loyaltyReady,
      stackingConfidence:loyaltyReady ? "high" : offer.stackingConfidence
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

function endOfOffer(value){
  if(!value) return null;
  const raw=String(value);
  const date=new Date(raw.length===10 ? raw+"T23:59:59.999Z" : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
