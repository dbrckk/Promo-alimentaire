import {filterActiveOffers,parisCivilDay} from "./ingestion.js";
import {filterOffers,isOfferWithinShoppingScope,effectivePercent} from "./domain.js";
import {effectiveRetailerPromoPercent} from "./retailer-promo.js";
import {effectiveOfferPercent,estimateOfferSaving,requiredQuantity} from "./matching.js";

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
    // The end of a month-long advertising campaign is not evidence that
    // its selection and conditions have been checked TODAY. A campaign
    // disappears from the daily recommendations after one unchecked week.
    || (Date.parse(today+"T12:00:00Z")-
      Date.parse(raw.verifiedAt+"T12:00:00Z"))>7*24*60*60*1000
    || (raw.startsAt && (!validDate(raw.startsAt) || raw.startsAt>today))
    // Without an exact product and actual basket price, a large "up to"
    // advert for nonfood is not verified >=50% savings.
    || !["alimentaire","épicerie","traiteur","bio","fruits et légumes"].includes(raw.category)
    || (raw.advertisedMaxPercent!==undefined
      && (!Number.isFinite(raw.advertisedMaxPercent)
        || raw.advertisedMaxPercent<0 || raw.advertisedMaxPercent>100))
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
// A retailer's multi-buy percentage and a manufacturer's quantity tiers
// describe different purchase quantities. Use the same minimum-quantity
// simulation as the product and basket tools, never a supplier's maximum
// advertised percentage applied to one article.
function pickSaving(offer,quantity){
  const price=offer.basePrice;
  if(Number.isFinite(price) && price>0){
    const saving=estimateOfferSaving(price,offer,quantity);
    return Number.isFinite(saving) && saving>0 ? saving : null;
  }
  // A flat verified voucher can specify its amount without listing a shelf
  // price, but percentage refunds cannot yield invented euro savings.
  if(Number.isFinite(offer.savingAmount) && offer.savingAmount>0
    && offer.savingAmountMode!=="per-unit"){
    const cap=Number.isFinite(offer.savingCapAmount)
      ? Math.max(0,offer.savingCapAmount) : Infinity;
    return Math.round(Math.min(cap,offer.savingAmount)*100)/100;
  }
  return null;
}
function pickRate(offer,quantity){
  if(offer.promoFormula) return effectiveRetailerPromoPercent(offer);
  // A fixed refund of 1 € on TWO 2 € products is 25% of the lot,
  // not 50% of the individual shelf price.
  if(Number.isFinite(offer.savingAmount)){
    const price=offer.basePrice;
    if(!Number.isFinite(price) || price<=0) return null;
    const saving=pickSaving(offer,quantity);
    return Number.isFinite(saving)
      ? Math.round(saving/(price*quantity)*10000)/100 : null;
  }
  const rate=effectiveOfferPercent(offer,quantity);
  if(Number.isFinite(rate)) return rate;
  // A quantity tier with no rate for the chosen quantity is not eligible.
  if(Array.isArray(offer.quantityTiers) && offer.quantityTiers.length) return null;
  return effectivePercent(offer);
}
function normalizePick(offer){
  const quantity=requiredQuantity(offer);
  const tiers=Array.isArray(offer.quantityTiers)?offer.quantityTiers:[];
  const bestTier=tiers.length
    ? [...tiers].filter((tier)=>Number.isFinite(tier.savingPercent))
      .sort((a,b)=>b.savingPercent-a.savingPercent || a.minQty-b.minQty)[0]
    : null;
  const maxAdvertisedRate=bestTier?.savingPercent ?? null;
  const minimumRate=pickRate(offer,quantity);
  return {
    id:offer.id,title:offer.title,providerId:offer.providerId,
    provider:offer.provider || offer.providerId,sourceUrl:offer.sourceUrl,
    category:offer.category || "alimentaire",verifiedAt:offer.verifiedAt,
    expiresAt:[offer.reviewAfter,offer.expiresAt].filter(Boolean).sort()[0] || null,
    savingAmount:pickSaving(offer,quantity),
    savingPercent:minimumRate,
    basePrice:Number.isFinite(offer.basePrice)?offer.basePrice:null,
    // The upfront expense is the documented reference price times the
    // minimum eligible quantity, NOT the expected cashback/net payment.
    upfrontCost:Number.isFinite(offer.basePrice) && offer.basePrice>0
      ? Math.round(offer.basePrice*quantity*100)/100 : null,
    minQuantity:quantity,
    higherTierPercent:Number.isFinite(maxAdvertisedRate)
      && (!Number.isFinite(minimumRate) || maxAdvertisedRate>minimumRate)
      ? maxAdvertisedRate : null,
    higherTierMinQuantity:bestTier?.minQty ?? null,
    higherTierMaxQuantity:bestTier?.maxQty ?? null,
    hasExactEan:Boolean(offer.eans?.length && offer.eanEvidenceUrl),
    requiresStoreVerification:Boolean(offer.requiresStoreVerification),
    rewardType:offer.rewardType || null,
    scope:offer.scope,
    candidate:true, // Nothing is automatically a guaranteed checkout price.
    needsActivation:offer.providerId!=="carrefour" && offer.providerId!=="leclerc"
  };
}
function orderOffers(a,b,sort="percent"){
  const number=(value)=>Number.isFinite(value)?value:-1;
  const rate=number(b.savingPercent)-number(a.savingPercent);
  const saving=number(b.savingAmount)-number(a.savingAmount);
  const price=number(a.upfrontCost)-number(b.upfrontCost);
  if(sort==="euros" && saving) return saving;
  if(sort==="budget"){
    if(Number.isFinite(a.upfrontCost)!==Number.isFinite(b.upfrontCost))
      return Number.isFinite(a.upfrontCost)?-1:1;
    if(Number.isFinite(a.upfrontCost) && Number.isFinite(b.upfrontCost) && price)
      return price;
  }
  if(rate) return rate;
  if(saving) return saving;
  if(a.hasExactEan!==b.hasExactEan) return a.hasExactEan ? -1 : 1;
  return String(a.title).localeCompare(String(b.title),"fr");
}

// No item can be declared affordable without a reference price for the
// exact minimum quantity; coupons requiring upfront payment count in full.
function affordable(item,maxSpend){
  return maxSpend===null || (Number.isFinite(item.upfrontCost)
    && item.upfrontCost<=maxSpend);
}

export function selectDailyCatalogue({
  offers=[],campaigns=[],store="carrefour",channel="store",now=new Date(),
  limit=8,sort="percent",maxSpend=null
}={}){
  const current=new Date(now);
  const today=parisCivilDay(current);
  const safeLimit=Number.isInteger(limit)?Math.max(1,Math.min(limit,30)):8;
  const ranking=["percent","euros","budget"].includes(sort)?sort:"percent";
  const budget=Number.isFinite(maxSpend) && maxSpend>0
    ? Math.round(maxSpend*100)/100 : null;
  const eligible=filterOffers(
    filterActiveOffers(offers,current).filter((offer)=>!offer.sourceSyncWarning
      && isOfferWithinShoppingScope(offer) && offer.scope==="produit"),
    {store,channel,search:""}
  );
  const picks=eligible.map(normalizePick).filter((item)=>affordable(item,budget));
  const retailer=picks.filter((item)=>item.providerId===store)
    .sort((a,b)=>orderOffers(a,b,ranking)).slice(0,safeLimit);
  const extra=picks.filter((item)=>item.providerId!==store)
    .sort((a,b)=>orderOffers(a,b,ranking)).slice(0,safeLimit);
  // Highlights are genuine dated product candidates only, deduplicated,
  // not speculative campaign maxima or inferred basket stacking savings.
  const highlights=[...picks]
    .filter((item)=>(Number.isFinite(item.savingPercent)
        && item.savingPercent>0)
      || (Number.isFinite(item.savingAmount) && item.savingAmount>0))
    .sort((a,b)=>orderOffers(a,b,ranking)).slice(0,3);
  const seen=new Set();
  const discovery=(Array.isArray(campaigns)?campaigns:[])
    .map((raw)=>safeCampaign(raw,today,store,channel)).filter(Boolean)
    .filter((entry)=>!seen.has(entry.id) && Boolean(seen.add(entry.id)))
    .sort((a,b)=>(b.advertisedMaxPercent??-1)-(a.advertisedMaxPercent??-1))
    .slice(0,safeLimit);
  return {today,store,channel,retailer,extra,campaigns:discovery,highlights,
    sort:ranking,maxSpend:budget,
    affordableCandidates:picks.length,
    exactRetailerCount:retailer.filter((item)=>item.hasExactEan).length};
}
