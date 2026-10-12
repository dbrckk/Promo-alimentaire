import {filterActiveOffers,parisCivilDay} from "./ingestion.js";
import {filterOffers,isOfferWithinShoppingScope,effectivePercent,computeSaving} from "./domain.js";
import {effectiveRetailerPromoPercent,minimumQuantityForRetailerPromo,estimateRetailerPromoSaving} from "./retailer-promo.js";

// Daily suggestions are NOT an additional price database. The imported
// retailer/manufacturer offers have already passed the ingestion validators.
// A campaign is editorial source discovery, never a priced or stackable offer.
function safeCampaign(raw,today,store,channel){
  if(!raw || raw.store!==store || !Array.isArray(raw.channels)
    || !raw.channels.includes(channel)
    || typeof raw.title!=="string" || !raw.title.trim()
    || typeof raw.id!=="string" || !raw.id.trim()
    || typeof raw.claim!=="string" || !raw.claim.trim()
    || !validDate(raw.verifiedAt) || !validDate(raw.expiresAt)
    || raw.verifiedAt>today || raw.expiresAt<today
    || (raw.startsAt && (!validDate(raw.startsAt) || raw.startsAt>today))
    || !isOfferWithinShoppingScope({category:raw.category,
      savingPercent:raw.category==="non-alimentaire" ? raw.advertisedMaxPercent : null})
  ) return null;
  try {
    const target=new URL(raw.sourceUrl);
    const allowed=store==="carrefour"
      ? target.hostname==="www.carrefour.fr"
      : target.hostname==="nos-catalogues-promos-v2.e.leclerc";
    if(target.protocol!=="https:" || !allowed
      || target.username || target.password || target.search || target.hash) return null;
  }catch{return null;}
  return {
    id:raw.id,title:raw.title,claim:raw.claim,sourceUrl:raw.sourceUrl,
    verifiedAt:raw.verifiedAt,expiresAt:raw.expiresAt,
    advertisedMaxPercent:Number.isFinite(raw.advertisedMaxPercent)
      ? raw.advertisedMaxPercent : null,
    status:"campaign-only",category:raw.category || "alimentaire"
  };
}
function validDate(value){
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d=new Date(value+"T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===value;
}
function itemSaving(offer){
  const value=computeSaving(offer);
  if(Number.isFinite(value) && value>0) return value;
  const qty=minimumQuantityForRetailerPromo(offer);
  const price=offer.basePrice;
  return qty && Number.isFinite(price) && price>0
    ? estimateRetailerPromoSaving(price,qty,offer) : null;
}
function rate(offer){
  const explicit=effectiveRetailerPromoPercent(offer);
  if(Number.isFinite(explicit)) return explicit;
  const other=effectivePercent(offer);
  return Number.isFinite(other)?other:null;
}
function normalizePick(offer){
  return {
    id:offer.id,title:offer.title,providerId:offer.providerId,
    provider:offer.provider || offer.providerId,sourceUrl:offer.sourceUrl,
    category:offer.category || "alimentaire",verifiedAt:offer.verifiedAt,
    expiresAt:offer.reviewAfter || offer.expiresAt || null,
    savingAmount:itemSaving(offer),savingPercent:rate(offer),
    basePrice:Number.isFinite(offer.basePrice)?offer.basePrice:null,
    minQuantity:minimumQuantityForRetailerPromo(offer)
      || (Number.isInteger(offer.minPurchaseQty)?offer.minPurchaseQty:1),
    hasExactEan:Boolean(offer.eans?.length && offer.eanEvidenceUrl),
    requiresStoreVerification:Boolean(offer.requiresStoreVerification),
    rewardType:offer.rewardType || null,
    scope:offer.scope,
    candidate:true, // Nothing is automatically a guaranteed checkout price.
    needsActivation:offer.providerId!=="carrefour" && offer.providerId!=="leclerc"
  };
}
function orderOffers(a,b){
  const aEan=a.hasExactEan?1:0,bEan=b.hasExactEan?1:0;
  if(aEan!==bEan) return bEan-aEan;
  const aRate=Number.isFinite(a.savingPercent)?a.savingPercent:-1;
  const bRate=Number.isFinite(b.savingPercent)?b.savingPercent:-1;
  if(aRate!==bRate) return bRate-aRate;
  const aAmount=Number.isFinite(a.savingAmount)?a.savingAmount:-1;
  const bAmount=Number.isFinite(b.savingAmount)?b.savingAmount:-1;
  if(aAmount!==bAmount) return bAmount-aAmount;
  return String(a.title).localeCompare(String(b.title),"fr");
}

export function selectDailyCatalogue({
  offers=[],campaigns=[],store="carrefour",channel="store",now=new Date(),limit=8
}={}){
  const current=new Date(now);
  const today=parisCivilDay(current);
  const eligible=filterOffers(
    filterActiveOffers(offers,current).filter((offer)=>!offer.sourceSyncWarning
      && isOfferWithinShoppingScope(offer) && offer.scope==="produit"),
    {store,channel,search:""}
  );
  const filtered=eligible.map(normalizePick);
  const retailer=filtered.filter((item)=>item.providerId===store)
    .sort(orderOffers).slice(0,limit);
  const extra=filtered.filter((item)=>item.providerId!==store)
    .sort(orderOffers).slice(0,limit);
  const seen=new Set();
  const discovery=(Array.isArray(campaigns)?campaigns:[])
    .map((raw)=>safeCampaign(raw,today,store,channel)).filter(Boolean)
    .filter((entry)=>!seen.has(entry.id) && Boolean(seen.add(entry.id)))
    .sort((a,b)=>(b.advertisedMaxPercent??-1)-(a.advertisedMaxPercent??-1))
    .slice(0,limit);
  return {today,store,channel,retailer,extra,campaigns:discovery,
    exactRetailerCount:retailer.filter((item)=>item.hasExactEan).length};
}
