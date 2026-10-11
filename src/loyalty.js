const CARREFOUR_SOURCE="https://www.carrefour.fr/faq?question=est-ce-les-primes-fidelite";
const CARREFOUR_PASS_SOURCE="https://www.carrefour.fr/services/carte-pass";

export const DEFAULT_LOYALTY_PROFILE={
  carrefour:"unknown",
  leclerc:"unknown"
};

export function normalizeLoyaltyProfile(profile={}){
  const carrefour=["unknown","none","club","pass"].includes(profile.carrefour)
    ? profile.carrefour
    : "unknown";
  const leclerc=["unknown","none","card"].includes(profile.leclerc)
    ? profile.leclerc
    : "unknown";
  return {carrefour,leclerc};
}

export function loyaltyRequirementState(requirement,profile={}){
  const value=normalizeLoyaltyProfile(profile);
  if(!requirement) return true;
  if(requirement==="carrefour-club"){
    if(value.carrefour==="unknown") return null;
    return value.carrefour==="club" || value.carrefour==="pass";
  }
  if(requirement==="carrefour-pass"){
    if(value.carrefour==="unknown") return null;
    return value.carrefour==="pass";
  }
  if(requirement==="leclerc-card"){
    if(value.leclerc==="unknown") return null;
    return value.leclerc==="card";
  }
  return null;
}

export function resolveOffersForLoyalty(offers,profile={}){
  return (offers || []).flatMap((offer)=>{
    if(!offer.requiresLoyalty) return [offer];
    const state=loyaltyRequirementState(offer.requiresLoyalty,profile);
    if(state===false) return [];
    if(state===true){
      return [{
        ...offer,
        loyaltyEligibility:"eligible",
        autoStack:offer.autoStackWhenEligible ?? offer.autoStack
      }];
    }
    return [{
      ...offer,
      loyaltyEligibility:"unknown",
      autoStack:false
    }];
  });
}

export function carrefourClubEligibility(product){
  if(!product) return null;
  const brand=normalizeText(product.brands);
  if(/\bcarrefour\s+(?:soft\s+)?bio\b/.test(brand)){
    return {kind:"carrefour-bio",confidence:"high",label:"Carrefour Bio"};
  }

  const categories=(product.categories || []).map(normalizeTag);
  const exact=new Set([
    "en:fruits","en:fresh-fruits","fr:fruits",
    "en:vegetables","en:fresh-vegetables","fr:legumes","fr:légumes",
    "en:fruits-and-vegetables"
  ]);
  if(categories.some((tag)=>exact.has(tag))){
    return {kind:"fruit-veg",confidence:"high",label:"Fruits & légumes",matchedCategory:categories.find((tag)=>exact.has(tag))};
  }
  return null;
}

export function buildProductLoyaltyOffers(product,{
  store,
  profile={},
  verifiedAt="2026-10-11"
}={}){
  if(store!=="carrefour") return [];
  const eligibility=carrefourClubEligibility(product);
  if(!eligibility) return [];

  const normalized=normalizeLoyaltyProfile(profile);
  if(normalized.carrefour==="none") return [];

  const isPass=normalized.carrefour==="pass";
  const isKnown=normalized.carrefour==="club" || isPass;
  const rate=isPass ? 15 : 10;
  const requirement=isPass ? "carrefour-pass" : "carrefour-club";
  // OFF classification / brand is not proof that the individual SKU belongs
  // to an activated Carrefour Club offer. Never manufacture an exact GTIN
  // promotion from the product currently being viewed.
  const productMatch=eligibility.kind==="carrefour-bio"
    ? {brands:["Carrefour Bio","Carrefour Soft Bio"],minScore:55}
    : {all:[eligibility.matchedCategory],minScore:10};

  return [{
    id:`carrefour-club-${product?.code || eligibility.kind}-${rate}`,
    provider:"Club Carrefour",
    providerId:"carrefour",
    title:isPass
      ? `Avantage PASS ${rate}% · ${eligibility.label}`
      : `Avantage Club ${rate}% · ${eligibility.label}`,
    type:"fidélité enseigne",
    category:"fidélité",
    stores:["carrefour"],
    channels:["store","drive","online"],
    savingPercent:rate,
    verifiedAt,
    reviewAfter:"2026-10-25",
    sourceUrl:isPass ? CARREFOUR_PASS_SOURCE : CARREFOUR_SOURCE,
    scope:"produit",
    mechanism:"retailer_loyalty",
    rewardType:"loyalty_credit",
    benefitTiming:"wallet",
    stackGroup:"carrefour-club-benefit",
    stackOrder:20,
    savingBasis:"current",
    // Card possession does not prove that the benefit was activated, that
    // the item is not excluded/promoted or that PASS was used for payment.
    autoStack:false,
    autoStackWhenEligible:false,
    requiresLoyalty:requirement,
    loyaltyEligibility:isKnown ? "activation-unverified" : "unknown",
    stackingConfidence:"unknown",
    stacking:"Estimation seulement : activation, prix, exclusions, magasin et éventuel paiement PASS à vérifier ; ne pas cumuler avec une autre promotion.",
    conditions:isPass
      ? "15% potentiels crédités en cagnotte avec avantages activés et Carte PASS liée au Club utilisée pour le paiement ; exclusions des produits promus, lots, 0,99€/1,29€, frais/surgelés/conserves selon rayon. Vérifier l'enseigne et le produit."
      : normalized.carrefour==="club"
        ? "10% potentiels crédités en cagnotte uniquement après activation des avantages Club ; catégories et exclusions (produits promus, lots, 0,99€/1,29€, etc.) à vérifier auprès du magasin."
        : "10% potentiels seulement après activation des avantages Club ; PASS peut porter à 15% selon le paiement et les exclusions. Profil à confirmer.",
    eans:[],
    productMatch
  }];
}

function normalizeTag(value){
  return String(value ?? "").trim().toLocaleLowerCase("fr");
}

function normalizeText(value){
  return String(value ?? "")
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g," ")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}
