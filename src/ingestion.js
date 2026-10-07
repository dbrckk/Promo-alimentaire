import { assertValidGtin } from "./gtin.js";

const STORES=new Set(["carrefour","leclerc","all"]);
const SCOPES=new Set(["produit","panier"]);

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
  const quantityTiers=normalizeQuantityTiers(value.quantityTiers,errors);
  if(!Number.isFinite(savingPercent) && !Number.isFinite(savingAmount) && !quantityTiers.length){
    errors.push("Une économie savingPercent, savingAmount ou quantityTiers est requise.");
  }
  if(Number.isFinite(savingPercent) && (savingPercent<0 || savingPercent>100)){
    errors.push("savingPercent doit être compris entre 0 et 100.");
  }
  if(Number.isFinite(savingAmount) && savingAmount<0){
    errors.push("savingAmount doit être positif.");
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
      basePrice:null,
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
      channels:Array.isArray(value.channels) ? value.channels.map((x)=>String(x).trim()).filter(Boolean) : [],
      mechanism:value.mechanism || null,
      stackGroup:value.stackGroup || null,
      stackOrder:Number.isFinite(Number(value.stackOrder)) ? Number(value.stackOrder) : 50,
      savingBasis:value.savingBasis==="base" ? "base" : "current",
      autoStack:value.autoStack===true,
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
