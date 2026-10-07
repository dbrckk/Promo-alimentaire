import { assertValidGtin } from "./gtin.js";

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
  for(const candidate of Array.isArray(value.eans) ? value.eans : []){
    try{ eans.push(assertValidGtin(candidate)); }
    catch(error){ errors.push(error.message); }
  }

  let eanEvidenceUrl=null;
  if(eans.length){
    eanEvidenceUrl=httpsUrl(value.eanEvidenceUrl,"eanEvidenceUrl",errors);
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
      category:value.category || "autre",
      stores,
      savingPercent:Number.isFinite(savingPercent) ? savingPercent : null,
      savingAmount:Number.isFinite(savingAmount) ? savingAmount : null,
      savingAmountMode,
      minPurchaseQty,
      savingCapAmount:Number.isFinite(savingCapAmount) ? savingCapAmount : null,
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
      autoStackWhenEligible:value.autoStackWhenEligible===true,
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
        && (scope!=="produit" || (eans.length>0 && Boolean(eanEvidenceUrl)))
        && value.requiresStoreVerification!==true
        && value.requiresChannelPriceVerification!==true
        && value.multiReference!==true
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

export function isOfferActive(offer,now=new Date()) {
  const current=new Date(now);
  if(Number.isNaN(current.getTime())) return false;
  if(offer.startsAt && current<new Date(offer.startsAt)) return false;
  if(offer.expiresAt){
    const end=new Date(String(offer.expiresAt).length===10 ? offer.expiresAt+"T23:59:59" : offer.expiresAt);
    if(current>end) return false;
  }
  if(offer.reviewAfter){
    const reviewEnd=new Date(String(offer.reviewAfter).length===10 ? offer.reviewAfter+"T23:59:59" : offer.reviewAfter);
    if(current>reviewEnd) return false;
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

function dateValue(value,field,errors,required){
  if(value===null || value===undefined || value===""){
    if(required) errors.push(`${field} est requis.`);
    return null;
  }
  const text=String(value);
  const date=new Date(text.length===10 ? text+"T12:00:00Z" : text);
  if(Number.isNaN(date.getTime())){
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
