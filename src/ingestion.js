import { assertValidGtin, canonicalGtin } from "./gtin.js";
import {validateRetailerGtinEvidence} from "./retailer-ean-evidence.js";

const STORES=new Set(["carrefour","leclerc","all"]);
const SCOPES=new Set(["produit","panier","bundle"]);

export function normalizeImportedOffer(raw) {
  const errors=[];
  const value=raw && typeof raw==="object" ? raw : {};

  const providerId=requiredText(value.providerId,"providerId",errors);
  const externalId=requiredText(value.externalId || value.id,"externalId",errors);
  const title=requiredText(value.title,"title",errors);
  const sourceUrl=httpsUrl(value.sourceUrl,"sourceUrl",errors);
  const verifiedAt=dateValue(value.verifiedAt,"verifiedAt",errors,true);
  const startsAt=dateValue(value.startsAt,"startsAt",errors,false);
  const expiresAt=dateValue(value.expiresAt,"expiresAt",errors,false);
  const reviewAfter=dateValue(value.reviewAfter,"reviewAfter",errors,false);
  const scope=SCOPES.has(value.scope) ? value.scope : "produit";

  const stores=[...new Set(Array.isArray(value.stores) ? value.stores : [])];
  if(!stores.length || stores.some((store)=>!STORES.has(store))){
    errors.push("stores doit contenir carrefour, leclerc ou all.");
  }

  const eans=[];
  const knownGtinKeys=new Set();
  for(const candidate of Array.isArray(value.eans) ? value.eans : []){
    try{
      const verified=assertValidGtin(candidate);
      const key=canonicalGtin(verified);
      if(!knownGtinKeys.has(key)){
        eans.push(verified);
        knownGtinKeys.add(key);
      }
    }catch(error){ errors.push(error.message); }
  }

  let eanEvidenceUrl=null;
  if(eans.length){
    eanEvidenceUrl=httpsUrl(value.eanEvidenceUrl,"eanEvidenceUrl",errors);
    if(eanEvidenceUrl){
      const proof=validateRetailerGtinEvidence({providerId,eans,eanEvidenceUrl});
      if(!proof.ok) errors.push("eanEvidenceUrl : "+proof.reason);
    }
  }

  const savingPercent=nullableNumber(value.savingPercent);
  const savingAmount=nullableNumber(value.savingAmount);
  const savingAmountMode=value.savingAmountMode==="per-unit" ? "per-unit" : "per-offer";
  const minPurchaseQty=Math.max(1,Math.trunc(Number(value.minPurchaseQty)||1));
  const savingCapAmount=nullableNumber(value.savingCapAmount);
  const basePrice=nullableNumber(value.basePrice);
  const sourceRegularPrice=nullableNumber(value.sourceRegularPrice);
  const sourcePromoPrice=nullableNumber(value.sourcePromoPrice);
  const promoFormula=normalizePromoFormula(value.promoFormula,errors);
  const quantityTiers=normalizeQuantityTiers(value.quantityTiers,errors);
  const bundleRequirements=normalizeBundleRequirements(value.bundleRequirements,errors);
  const bundleTargetRequirementId=value.bundleTargetRequirementId
    ? String(value.bundleTargetRequirementId).trim()
    : null;
  if(!Number.isFinite(savingPercent) && !Number.isFinite(savingAmount) && !quantityTiers.length){
    errors.push("Une économie savingPercent, savingAmount ou quantityTiers est requise.");
  }
  if(Number.isFinite(savingPercent) && (savingPercent<0 || savingPercent>100)){
    errors.push("savingPercent doit être compris entre 0 et 100.");
  }
  if(Number.isFinite(savingAmount) && savingAmount<0){
    errors.push("savingAmount doit être positif.");
  }
  if(Number.isFinite(savingCapAmount) && savingCapAmount<=0){
    errors.push("savingCapAmount doit être strictement positif.");
  }
  if(scope==="bundle"){
    if(bundleRequirements.length<2) errors.push("Une offre bundle nécessite au moins 2 bundleRequirements.");
    if(!bundleTargetRequirementId || !bundleRequirements.some((item)=>item.id===bundleTargetRequirementId)){
      errors.push("bundleTargetRequirementId doit référencer une exigence du bundle.");
    }
  }
  if(startsAt && expiresAt && new Date(startsAt)>new Date(expiresAt)){
    errors.push("startsAt doit précéder expiresAt.");
  }
  if(reviewAfter && verifiedAt && new Date(reviewAfter)<new Date(verifiedAt)){
    errors.push("reviewAfter ne peut pas précéder verifiedAt.");
  }

  if(errors.length){
    return {ok:false,errors,value:null};
  }

  return {
    ok:true,
    errors:[],
    value:{
      id:`${providerId}-${externalId}`,
      externalId,
      providerId,
      provider:value.provider || providerId,
      title,
      type:value.type || "ODR",
      category:couponNetworkCategory(value,providerId),
      stores,
      savingPercent:Number.isFinite(savingPercent) ? savingPercent : null,
      savingAmount:Number.isFinite(savingAmount) ? savingAmount : null,
      savingAmountMode,
      minPurchaseQty,
      savingCapAmount:Number.isFinite(savingCapAmount) ? savingCapAmount : null,
      requiresUnlock:value.requiresUnlock===true,
      unlockConditions:value.requiresUnlock===true
        ? String(value.unlockConditions || "Conditions de déblocage à vérifier.").slice(0,280)
        : null,
      basePrice:Number.isFinite(basePrice) ? basePrice : null,
      sourceRegularPrice:Number.isFinite(sourceRegularPrice) ? sourceRegularPrice : null,
      sourcePromoPrice:Number.isFinite(sourcePromoPrice) ? sourcePromoPrice : null,
      verifiedAt,
      startsAt,
      expiresAt,
      reviewAfter,
      sourceUrl,
      scope,
      eans:[...new Set(eans)],
      eanEvidenceUrl,
      eanSuggestion:normalizeEanSuggestion(value.eanSuggestion,providerId,eans),
      productMatch:normalizeProductMatch(value.productMatch),
      referenceNames:Array.isArray(value.referenceNames) ? value.referenceNames.map((x)=>String(x).trim()).filter(Boolean) : [],
      quantityTiers,
      bundleRequirements,
      bundleTargetRequirementId,
      channels:Array.isArray(value.channels) ? value.channels.map((x)=>String(x).trim()).filter(Boolean) : [],
      mechanism:value.mechanism || null,
      rewardType:value.rewardType || null,
      benefitTiming:value.benefitTiming || null,
      requiresLoyalty:value.requiresLoyalty || null,
      // Imported data is not an authority to restore automatic savings.
      // resolveOffersForLoyalty() promotes autoStackWhenEligible after card
      // selection; this must never bypass EAN, merchant/source, activation,
      // store verification or non-stackable refund checks.
      autoStackWhenEligible:false,
      requiresStoreVerification:value.requiresStoreVerification===true,
      requiresChannelPriceVerification:value.requiresChannelPriceVerification===true,
      multiReference:value.multiReference===true,
      eanResolutionBlocked:value.eanResolutionBlocked===true,
      eanResolutionReason:value.eanResolutionReason
        ? String(value.eanResolutionReason).trim()
        : null,
      promoFormula,
      stackGroup:value.stackGroup || null,
      stackOrder:Number.isFinite(Number(value.stackOrder)) ? Number(value.stackOrder) : 50,
      savingBasis:value.savingBasis==="base" ? "base" : "current",
      autoStack:value.autoStack===true
        && (scope==="panier"
          ? trustedImportedGiftCard({value,stores,sourceUrl,verifiedAt,reviewAfter,savingPercent,savingAmount})
          : scope==="produit" && eans.length>0 && Boolean(eanEvidenceUrl))
        && value.requiresStoreVerification!==true
        && value.requiresChannelPriceVerification!==true
        && value.multiReference!==true
        && value.requiresUnlock!==true
        && !value.requiresLoyalty,
      stackingConfidence:value.stackingConfidence || "unknown",
      stacking:value.stacking || "conditions à vérifier",
      conditions:value.conditions || "",
      ingestion:{
        exactEanTraceable:eans.length>0 && Boolean(eanEvidenceUrl),
        importedAt:new Date().toISOString()
      }
    }
  };
}

// The JSON flag autoStack cannot grant arbitrary imported basket discounts.
// Only dated, traceable, first-party gift-card listings are eligible.
// Public Coupon Network cards do not expose a structured product category.
// An unclassified coupon stays a conditional candidate, but clearly nonfood
// items must not bypass the product rule requiring >=50% on other domains.
// Match only distinctive words in the actual product/conditions: broad brand
// names and generic words (e.g. "bio" or "maison") are not sufficient.
function couponNetworkCategory(value,providerId){
  if(providerId!=="coupon-network") return value.category || "autre";
  const source=[
    value.title,value.conditions,
    ...(Array.isArray(value.referenceNames)?value.referenceNames:[])
  ].filter(Boolean).join(" ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("fr");

  const nonFood=/\b(?:lessives?|adoucissants?|assouplissants?|nettoyants?|detergents?|liquides? vaisselle|lave[- ]vaisselle|absorbeurs?|anti[- ]humidite|shampooings?|shampoings?|apres[- ]shampooings?|dentifrices?|deodorants?|antitranspirants?|anti[- ]transpirants?|gels? douche|savons?|lingettes?|couches?|papiers? toilettes?|blocs? wc|sous[- ]vetements? absorbants?|croquettes?|litieres?|friandises? pour (?:chat|chien)s?|filtres? a eau|maquillage)\b/;
  if(nonFood.test(source)) return "non-alimentaire";

  const alcohol=/\b(?:vodka|whisky|whiskey|rhum|tequila|bieres?|vins?|champagne|cidre|liqueurs?|aperitifs?)\b/;
  if(alcohol.test(source) && !/\bsans alcool\b/.test(source)){
    return "hors-alimentaire";
  }
  return value.category || "autre";
}

export function trustedImportedGiftCard({
  value,
  stores=[],
  sourceUrl=null,
  verifiedAt=null,
  reviewAfter=null,
  savingPercent=null,
  savingAmount=null
}={}){
  const hosts={
    "fidme-courses":"fidme.com",
    widilo:"widilo.fr",
    ebuyclub:"ebuyclub.com",
    poulpeo:"poulpeo.com"
  };
  const expectedHost=hosts[value?.providerId];
  if(!expectedHost || value?.mechanism!=="gift_card"
    || value?.scope!=="panier" || value?.stackGroup!=="payment-discount"){
    return false;
  }
  if(stores.length!==1 || !["carrefour","leclerc"].includes(stores[0])){
    return false;
  }
  if(!Array.isArray(value.channels)
    || value.channels.length!==1 || value.channels[0]!=="store"){
    return false;
  }
  if(!Number.isFinite(savingPercent) || savingPercent<=0 || savingPercent>15
    || Number.isFinite(savingAmount)){
    return false;
  }
  let hostname;
  try{hostname=new URL(sourceUrl).hostname.toLocaleLowerCase("en");}
  catch{return false;}
  if(hostname!==expectedHost && !hostname.endsWith("."+expectedHost)){
    return false;
  }
  if(!verifiedAt || !reviewAfter) return false;
  const from=new Date(String(verifiedAt).slice(0,10)+"T00:00:00Z");
  const until=new Date(String(reviewAfter).slice(0,10)+"T00:00:00Z");
  const days=(until-from)/(24*60*60*1000);
  return Number.isFinite(days) && days>=0 && days<=14;
}

export function validateImportBatch(records) {
  const values=Array.isArray(records) ? records : [];
  const normalized=[];
  const errors=[];
  const ids=new Set();
  if(!Array.isArray(records)){
    errors.push({index:-1,errors:["Le lot d'import doit être un tableau d'offres."]});
  }

  values.forEach((record,index)=>{
    const result=normalizeImportedOffer(record);
    if(!result.ok){
      errors.push({index,errors:result.errors});
      return;
    }
    if(ids.has(result.value.id)){
      errors.push({index,errors:[`Identifiant dupliqué : ${result.value.id}`]});
      return;
    }
    ids.add(result.value.id);
    normalized.push(result.value);
  });

  return {
    ok:errors.length===0,
    normalized,
    errors
  };
}

export function filterActiveOffers(offers,now=new Date()){
  return (offers || []).filter((offer)=>isOfferActive(offer,now));
}

export function shopmiumLegacyReviewCutoff(offer){
  if(offer?.providerId!=="shopmium") return null;
  const stamp=String(offer.verifiedAt||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return null;
  const checkedAt=new Date(stamp+"T12:00:00Z");
  if(Number.isNaN(checkedAt.getTime())) return null;
  checkedAt.setUTCDate(checkedAt.getUTCDate()+5);
  checkedAt.setUTCHours(23,59,59,999);
  return checkedAt;
}

// A date without a clock is the French shopping calendar day, never UTC
// midnight or whichever timezone the CI runner/device happens to use.
// Explicit ISO timestamps, by contrast, always refer to a precise instant.
const PARIS_DAY_FORMATTER=new Intl.DateTimeFormat("en-GB",{
  timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"
});
export function parisCivilDay(now=new Date()){
  const date=new Date(now);
  if(!Number.isFinite(date.getTime())) return null;
  const parts=PARIS_DAY_FORMATTER.formatToParts(date);
  const read=(key)=>parts.find((part)=>part.type===key)?.value;
  return [read("year"),read("month"),read("day")].join("-");
}

export function isOfferActive(offer,now=new Date()) {
  const current=new Date(now);
  const day=parisCivilDay(current);
  if(!day || !offer || typeof offer!=="object") return false;

  // Date-only fields are inclusive for their entire civil day in France.
  // The lexicographic comparison works because dates were checked as strict
  // ISO YYYY-MM-DD. Precise timestamps retain exact second resolution.
  const reached=(raw)=>{
    const text=String(raw);
    return text.length===10 ? text<=day : new Date(text)<=current;
  };
  const notEnded=(raw)=>{
    const text=String(raw);
    return text.length===10 ? text>=day : new Date(text)>=current;
  };
  // Missing verification may occur in legacy static rules, but an invalid
  // or future verification date must never count as proof.
  if(offer.verifiedAt && (!validOfferDate(String(offer.verifiedAt))
    || !reached(offer.verifiedAt))) return false;
  if(offer.startsAt && (!validOfferDate(String(offer.startsAt))
    || !reached(offer.startsAt))) return false;
  if(offer.reviewAfter && (!validOfferDate(String(offer.reviewAfter))
    || !notEnded(offer.reviewAfter))) return false;
  if(offer.expiresAt && (!validOfferDate(String(offer.expiresAt))
    || !notEnded(offer.expiresAt))) return false;
  // The campaign's advertised expiry alone does not prove that Shopmium
  // remains open. Legacy unconfirmed offers expire after the fifth French
  // review day, consistently on CI (UTC) and Android (local timezone).
  if(offer.providerId==="shopmium"){
    const reviewCutoff=shopmiumLegacyReviewCutoff(offer);
    if(!reviewCutoff || day>reviewCutoff.toISOString().slice(0,10)) return false;
  }
  return true;
}

function requiredText(value,field,errors){
  const text=String(value ?? "").trim();
  if(!text) errors.push(`${field} est requis.`);
  return text;
}

function httpsUrl(value,field,errors){
  const text=String(value ?? "").trim();
  try{
    const url=new URL(text);
    if(url.protocol!=="https:") throw new Error();
    return url.toString();
  }catch{
    errors.push(`${field} doit être une URL HTTPS.`);
    return null;
  }
}

// Only unambiguous ISO dates or ISO timestamps with an explicit timezone.
// Date.parse alone silently normalizes impossible dates such as February 30.
function validOfferDate(value){
  const text=String(value);
  const match=/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(text);
  if(!match) return false;
  const civil=match[1]+"-"+match[2]+"-"+match[3];
  const day=new Date(civil+"T12:00:00Z");
  if(!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10)!==civil) return false;
  if(text.length===10) return true;
  // A full timestamp can be valid while carrying the preceding/following
  // UTC day due to its timezone offset; only its local civil day is checked.
  const instant=new Date(text);
  return Number.isFinite(instant.getTime());
}

function dateValue(value,field,errors,required){
  if(value===null || value===undefined || value===""){
    if(required) errors.push(`${field} est requis.`);
    return null;
  }
  const text=String(value);
  if(!validOfferDate(text)){
    errors.push(`${field} est invalide.`);
    return null;
  }
  return text;
}

function nullableNumber(value){
  if(value===null || value===undefined || value==="") return null;
  const number=Number(value);
  return Number.isFinite(number) ? number : null;
}


function normalizeEanSuggestion(value,providerId,eans){
  // Open Food Facts suggests a product identity, not retailer promotion eligibility.
  if(providerId!=="leclerc" || (eans || []).length || !value || typeof value!=="object"){
    return null;
  }
  try{
    const code=assertValidGtin(value.code);
    const url=new URL(String(value.sourceUrl || ""));
    if(url.protocol!=="https:" || url.hostname!=="world.openfoodfacts.org"
      || url.pathname!=="/product/"+code || value.requiresMerchantConfirmation!==true){
      return null;
    }
    return {
      code,sourceUrl:url.toString(),
      productName:String(value.productName || "").slice(0,160),
      brands:String(value.brands || "").slice(0,100),
      requiresMerchantConfirmation:true
    };
  }catch{
    return null;
  }
}

function normalizeProductMatch(value){
  if(!value || typeof value!=="object") return null;
  const list=(field)=>Array.isArray(value[field]) ? value[field].map((x)=>String(x).trim()).filter(Boolean) : [];
  const result={
    brands:list("brands"),
    any:list("any"),
    all:list("all"),
    minScore:Number.isFinite(Number(value.minScore)) ? Number(value.minScore) : 55
  };
  if(!result.brands.length && !result.any.length && !result.all.length) return null;
  return result;
}

function normalizeQuantityTiers(value,errors){
  if(value===null || value===undefined) return [];
  if(!Array.isArray(value)){
    errors.push("quantityTiers doit être un tableau.");
    return [];
  }
  const tiers=[];
  for(const [index,item] of value.entries()){
    const minQty=Math.trunc(Number(item?.minQty));
    const maxQty=item?.maxQty===null || item?.maxQty===undefined ? null : Math.trunc(Number(item.maxQty));
    const savingPercent=Number(item?.savingPercent);
    if(!Number.isFinite(minQty) || minQty<1){
      errors.push(`quantityTiers[${index}].minQty invalide.`);
      continue;
    }
    if(maxQty!==null && (!Number.isFinite(maxQty) || maxQty<minQty)){
      errors.push(`quantityTiers[${index}].maxQty invalide.`);
      continue;
    }
    if(!Number.isFinite(savingPercent) || savingPercent<0 || savingPercent>100){
      errors.push(`quantityTiers[${index}].savingPercent invalide.`);
      continue;
    }
    tiers.push({minQty,maxQty,savingPercent});
  }
  return tiers.sort((a,b)=>a.minQty-b.minQty);
}


function normalizeBundleRequirements(value,errors){
  if(value===null || value===undefined) return [];
  if(!Array.isArray(value)){
    errors.push("bundleRequirements doit être un tableau.");
    return [];
  }
  const seen=new Set();
  const result=[];
  value.forEach((item,index)=>{
    const id=String(item?.id ?? "").trim();
    if(!id){
      errors.push(`bundleRequirements[${index}].id est requis.`);
      return;
    }
    if(seen.has(id)){
      errors.push(`bundleRequirements id dupliqué : ${id}`);
      return;
    }
    seen.add(id);
    const minQty=Math.max(1,Math.trunc(Number(item?.minQty)||1));
    const productMatch=normalizeProductMatch(item?.productMatch);
    if(!productMatch){
      errors.push(`bundleRequirements[${index}].productMatch est requis.`);
      return;
    }
    result.push({id,minQty,productMatch});
  });
  return result;
}


function normalizePromoFormula(value,errors){
  if(value===null || value===undefined) return null;
  if(typeof value!=="object"){
    errors.push("promoFormula doit être un objet.");
    return null;
  }
  const type=String(value.type || "").trim();
  if(type==="nth_percent"){
    const nth=Math.max(1,Math.trunc(Number(value.nth)||2));
    const cycle=Math.max(nth,Math.trunc(Number(value.cycle)||nth));
    const percent=Number(value.percent);
    if(!Number.isFinite(percent)||percent<=0||percent>100){
      errors.push("promoFormula.percent invalide.");
      return null;
    }
    return {type,nth,cycle,percent,repeat:value.repeat!==false};
  }
  if(type==="buy_x_get_y_free"){
    const buy=Math.max(1,Math.trunc(Number(value.buy)||1));
    const free=Math.max(1,Math.trunc(Number(value.free)||1));
    return {type,buy,free,repeat:value.repeat!==false};
  }
  if(type==="bundle_price"){
    const groupQty=Math.max(2,Math.trunc(Number(value.groupQty)||2));
    const bundlePrice=Number(value.bundlePrice);
    if(!Number.isFinite(bundlePrice)||bundlePrice<0){
      errors.push("promoFormula.bundlePrice invalide.");
      return null;
    }
    return {type,groupQty,bundlePrice,repeat:value.repeat!==false};
  }
  errors.push("promoFormula.type invalide.");
  return null;
}
