export function offerEvidenceStatus(offer,{
  match=null,
  loyaltyProfile={},
  storeVerified=false
}={}){
  const productExact=Boolean(match?.exact || (Array.isArray(offer?.eans) && offer.eans.length));
  const productKnown=productExact || Boolean(offer?.productMatch);
  const requiresStore=offer?.requiresStoreVerification===true;
  const storeOk=!requiresStore || storeVerified===true || offer?.storeVerified===true;

  const loyalty=loyaltyState(offer?.requiresLoyalty,loyaltyProfile);
  const loyaltyOk=loyalty===true;
  const loyaltyUnknown=loyalty===null;

  let level="candidate";
  if(productExact && storeOk && loyaltyOk) level="verified";
  else if(productExact && storeOk && !offer?.requiresLoyalty) level="verified";
  else if(productExact) level="exact-product";
  else if(productKnown) level="heuristic";

  const blockers=[];
  if(!productExact) blockers.push("Référence produit exacte non prouvée");
  if(requiresStore && !storeOk) blockers.push("Disponibilité dans ce magasin non confirmée");
  if(offer?.requiresLoyalty && !loyaltyOk){
    blockers.push(loyaltyUnknown
      ? "Carte fidélité non renseignée"
      : "Carte fidélité requise non disponible");
  }

  return {
    level,
    productExact,
    storeVerified:storeOk,
    loyaltyVerified:loyaltyOk,
    blockers,
    canGuarantee:productExact && storeOk && (!offer?.requiresLoyalty || loyaltyOk)
  };
}

function loyaltyState(requirement,profile){
  if(!requirement) return true;
  if(requirement==="carrefour-club"){
    const value=profile?.carrefour;
    if(!value || value==="unknown") return null;
    return value==="club" || value==="pass";
  }
  if(requirement==="carrefour-pass"){
    const value=profile?.carrefour;
    if(!value || value==="unknown") return null;
    return value==="pass";
  }
  if(requirement==="leclerc-card"){
    const value=profile?.leclerc;
    if(!value || value==="unknown") return null;
    return value==="card";
  }
  return null;
}
