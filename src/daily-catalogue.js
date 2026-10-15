import {filterActiveOffers,parisCivilDay} from "./ingestion.js";
import {filterOffers,isOfferWithinShoppingScope,effectivePercent} from "./domain.js";
import {effectiveRetailerPromoPercent} from "./retailer-promo.js";
import {effectiveOfferPercent,estimateOfferSaving,requiredQuantity} from "./matching.js";

// Campaign detail links are distinct from the official evidence page:
// a landing page can show a product selection without proving the advertised
// discount for a specific EAN. Only allow verified, pinned retailer paths.
const CAMPAIGN_DETAILS=new Map([
  ["carrefour-bio-2eme-20261019","https://www.carrefour.fr/r/bio-et-ecologie"],
  ["carrefour-bons-plans-famille-20261016",
    "https://www.carrefour.fr/evenements/le-coin-des-familles"],
  ["carrefour-semaine-second-20261019",
    "https://www.carrefour.fr/boutique/promos-hebdomadaires"],
  ["carrefour-semaine-gout-20261026",
    "https://www.carrefour.fr/evenements/semaine-du-gout"]
]);

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
  // A ceiling advertised on the *second* article is not a discount on
  // the entire two-item purchase. Even under the favourable equal-price
  // assumption, the rate on the lot is half of the second-item discount.
  // This is an illustration, NOT a product saving or a basket deduction.
  const mechanism=raw.offerMechanism ?? null;
  if(mechanism!==null && mechanism!=="second-item" && mechanism!=="three-for-two")
    return null;
  if(mechanism==="second-item"
    && (!Number.isFinite(raw.advertisedMaxPercent)
      || raw.advertisedMaxPercent<=0
      || !/(?:2(?:e|ème|eme|ième)|deuxi[eè]me)/i.test(raw.title+" "+raw.claim)))
    return null;
  if(mechanism==="three-for-two"
    && (raw.advertisedMaxPercent!==undefined
      || !/(?:2\s*\+\s*1|deux achet[eé]s)/i.test(raw.title+" "+raw.claim)))
    return null;
  const advertisedPrice=raw.advertisedPrice===undefined ? null : raw.advertisedPrice;
  if(advertisedPrice!==null
    && (!Number.isFinite(advertisedPrice) || advertisedPrice<=0
      || advertisedPrice>1000 || !["kg","pièce"].includes(raw.priceUnit)
      || !raw.title.includes(advertisedPrice.toFixed(2).replace(".",","))))
    return null;
  if(advertisedPrice===null && raw.priceUnit!==undefined) return null;
  // Some loyalty benefits require a minimum checkout spend. A campaign
  // requiring 15 € must never appear as affordable under a 3 € cash limit.
  const minimumPurchase=raw.minimumPurchase===undefined
    ? null :raw.minimumPurchase;
  if(minimumPurchase!==null && (!Number.isFinite(minimumPurchase)
    || minimumPurchase<=0 || minimumPurchase>1000
    || !new RegExp(String(minimumPurchase).replace(".","[,.]")+"\\s*€").test(
      raw.claim+" "+raw.title))) return null;
  try {
    const target=new URL(raw.sourceUrl);
    const allowed=store==="carrefour"
      ? target.hostname==="www.carrefour.fr"
      : target.hostname==="nos-catalogues-promos-v2.e.leclerc";
    if(target.protocol!=="https:" || !allowed
      || target.username || target.password || target.search || target.hash) return null;
  }catch{return null;}
  // A one-day low-budget selection has a fixed official detail page.
  // Never accept arbitrary merchant or third-party URLs from raw JSON.
  const pinnedDetails=/^carrefour-public-lead-quotidien-1-\d{8}$/.test(raw.id)
    ? "https://www.carrefour.fr/boutique/produits-1euro"
    : CAMPAIGN_DETAILS.get(raw.id);
  if(raw.detailsUrl!==undefined
    && (typeof raw.detailsUrl!=="string"
      || pinnedDetails!==raw.detailsUrl)) return null;
  return {
    id:raw.id,title:raw.title,claim:raw.claim,sourceUrl:raw.sourceUrl,
    detailsUrl:raw.detailsUrl || null,
    verifiedAt:raw.verifiedAt,expiresAt:raw.expiresAt,
    advertisedMaxPercent:Number.isFinite(raw.advertisedMaxPercent)
      ? raw.advertisedMaxPercent : null,
    status:"campaign-only",category:raw.category || "alimentaire",
    offerMechanism:mechanism,advertisedPrice,minimumPurchase,
    priceUnit:advertisedPrice!==null?raw.priceUnit:null,
    illustrativeBasketPercent:mechanism==="second-item"
      ? Math.round(raw.advertisedMaxPercent*50)/100
      : mechanism==="three-for-two" ? Math.round(100/3*100)/100 : null,
    illustrativeQuantity:mechanism==="second-item" ? 2
      : mechanism==="three-for-two" ? 3 : null
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
  const upfrontCost=Number.isFinite(offer.basePrice) && offer.basePrice>0
    ? Math.round(offer.basePrice*quantity*100)/100 : null;
  const savingAmount=pickSaving(offer,quantity);
  // A conditional cashback or loyalty credit may arrive after checkout.
  // This is the theoretical final cost, NEVER cash required to buy the lot.
  const netAfterBenefit=Number.isFinite(upfrontCost)
    && Number.isFinite(savingAmount) && savingAmount>=0
    && savingAmount<=upfrontCost
    ? Math.round((upfrontCost-savingAmount)*100)/100 : null;
  return {
    id:offer.id,title:offer.title,providerId:offer.providerId,
    provider:offer.provider || offer.providerId,sourceUrl:offer.sourceUrl,
    category:offer.category || "alimentaire",verifiedAt:offer.verifiedAt,
    expiresAt:[offer.reviewAfter,offer.expiresAt].filter(Boolean).sort()[0] || null,
    savingAmount,
    savingPercent:minimumRate,
    basePrice:Number.isFinite(offer.basePrice)?offer.basePrice:null,
    // The upfront expense is the documented reference price times the
    // minimum eligible quantity, NOT the expected cashback/net payment.
    upfrontCost,netAfterBenefit,
    minQuantity:quantity,
    higherTierPercent:Number.isFinite(maxAdvertisedRate)
      && (!Number.isFinite(minimumRate) || maxAdvertisedRate>minimumRate)
      ? maxAdvertisedRate : null,
    higherTierMinQuantity:bestTier?.minQty ?? null,
    higherTierMaxQuantity:bestTier?.maxQty ?? null,
    hasExactEan:Boolean(offer.eans?.length && offer.eanEvidenceUrl),
    requiresStoreVerification:Boolean(offer.requiresStoreVerification),
    rewardType:offer.rewardType || null,
    mechanism:offer.mechanism || null,
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
  if(sort==="net"){
    // A missing price or cashback amount cannot be treated as a free lot.
    if(Number.isFinite(a.netAfterBenefit)!==Number.isFinite(b.netAfterBenefit))
      return Number.isFinite(a.netAfterBenefit)?-1:1;
    if(Number.isFinite(a.netAfterBenefit) && Number.isFinite(b.netAfterBenefit)
      && a.netAfterBenefit!==b.netAfterBenefit)
      return a.netAfterBenefit-b.netAfterBenefit;
    if(price) return price;
  }
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

// A promotional headline is not an actionable price comparison. Keep the
// first three recommendations for actual priced, dated product records:
// the minimum eligible purchase quantity, money advanced, and computed euro
// benefit must all be known. Unknown prices remain discoverable in the
// dedicated retailer and coupon lists, never as a "best buy".
export function pickActionableDailyDeals(picks,{sort="percent",limit=3}={}){
  const safeLimit=Number.isInteger(limit)?Math.max(1,Math.min(10,limit)):3;
  const ranking=["percent","euros","budget","net"].includes(sort)?sort:"percent";
  const priced=(Array.isArray(picks)?picks:[])
    .filter((item)=>item && typeof item.id==="string"
      && Number.isFinite(item.upfrontCost) && item.upfrontCost>0
      && Number.isFinite(item.savingAmount) && item.savingAmount>0
      && item.savingAmount<=item.upfrontCost
      && Number.isFinite(item.savingPercent) && item.savingPercent>0
      && Number.isInteger(item.minQuantity) && item.minQuantity>0
      && item.needsReconfirmation!==true)
    .sort((a,b)=>orderOffers(a,b,ranking)
      || Number(b.hasExactEan)-Number(a.hasExactEan));
  // Prefer different food groups if there are equally useful opportunities:
  // first take the strongest, then the best of each not-yet-selected category,
  // finally complete the shortlist. Never sum non-stackable benefits.
  const selected=[];
  const ids=new Set();
  const categories=new Set();
  const add=(item)=>{
    if(ids.has(item.id) || selected.length>=safeLimit) return;
    selected.push(item);
    ids.add(item.id);
    categories.add(item.category || "alimentaire");
  };
  if(priced.length) add(priced[0]);
  for(const item of priced){
    if(!categories.has(item.category || "alimentaire")) add(item);
  }
  for(const item of priced) add(item);
  return selected.sort((a,b)=>orderOffers(a,b,ranking));
}

// No item can be declared affordable without a reference price for the
// exact minimum quantity; coupons requiring upfront payment count in full.
function affordable(item,maxSpend){
  return maxSpend===null || (Number.isFinite(item.upfrontCost)
    && item.upfrontCost<=maxSpend);
}

// Explore the FULL dated, conditional food-refund inventory rather than only
// the first twelve budget-ranked daily recommendations. Source evidence is
// not a confirmed checkout price, local availability or a paid refund.
const FOOD_REFUND_CATEGORIES=new Set([
  "alimentaire","épicerie","traiteur","bio","fruits et légumes"
]);
const REFUND_SOURCE_HOSTS={
  "coupon-network":new Set([
    "www.couponnetwork.fr","prod-cn-offers.couponnetwork.fr"
  ]),
  shopmium:new Set(["offers.shopmium.com"])
};
function knownRefundSource(offer){
  const hosts=REFUND_SOURCE_HOSTS[offer?.providerId];
  if(!hosts) return false;
  try{
    const url=new URL(offer.sourceUrl);
    return url.protocol==="https:" && !url.username && !url.password
      && hosts.has(url.hostname);
  }catch{return false;}
}
function foldRefundQuery(value){
  return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("fr");
}
/**
 * Only dated, currently reviewable manufacturer refunds with explicit food
 * classification and official source links. The cash budget cannot filter
 * an unknown shelf price; do not claim any candidate is affordable.
 */
export function selectFoodRefundOpportunities({
  offers=[],store="carrefour",channel="store",now=new Date(),
  provider="all",search="",sort="amount",limit=24
}={}){
  const count=Number.isInteger(limit)?Math.max(1,Math.min(limit,240)):24;
  const selectedProvider=Object.hasOwn(REFUND_SOURCE_HOSTS,provider)
    ?provider:"all";
  const needle=foldRefundQuery(search).trim().slice(0,90);
  const active=filterActiveOffers(Array.isArray(offers)?offers:[],new Date(now))
    .filter((offer)=>offer.scope==="produit"
      && offer.mechanism==="manufacturer_refund"
      && FOOD_REFUND_CATEGORIES.has(offer.category)
      && !offer.sourceSyncWarning
      && typeof offer.verifiedAt==="string"
      && Boolean(offer.reviewAfter || offer.expiresAt)
      && knownRefundSource(offer)
      && isOfferWithinShoppingScope(offer));
  const scoped=filterOffers(active,{store,channel,search:""})
    .filter((offer)=>selectedProvider==="all"
      || offer.providerId===selectedProvider)
    .filter((offer)=>!needle || foldRefundQuery([
      offer.title,offer.provider,offer.conditions,
      ...(Array.isArray(offer.referenceNames)?offer.referenceNames:[])
    ].join(" ")).includes(needle))
    .map((offer)=>({
      ...normalizePick(offer),
      reviewAfter:offer.reviewAfter||null,
      merchantExpiry:offer.expiresAt||null,
      requiresUnlock:offer.requiresUnlock===true,
      unlockConditions:typeof offer.unlockConditions==="string"
        ?offer.unlockConditions.slice(0,240):"",
      conditions:typeof offer.conditions==="string"
        ?offer.conditions.slice(0,340):"",
      // Never infer a product shelf price or advance-cash budget.
      upfrontKnown:Number.isFinite(offer.basePrice)&&offer.basePrice>0
    }))
    .filter((item)=>(Number.isFinite(item.savingAmount)
      && item.savingAmount>0) || (Number.isFinite(item.savingPercent)
      && item.savingPercent>0));
  const compareAmounts=(a,b)=>{
    const fixedA=Number.isFinite(a.savingAmount);
    const fixedB=Number.isFinite(b.savingAmount);
    // A fixed number of euros and a percentage are incomparable without a
    // price: keep euro-denominated offers together, then percentage offers.
    if(fixedA!==fixedB) return fixedA?-1:1;
    if(fixedA && a.savingAmount!==b.savingAmount)
      return b.savingAmount-a.savingAmount;
    return (b.savingPercent??-1)-(a.savingPercent??-1);
  };
  const ranking=sort==="recent"?"recent":"amount";
  scoped.sort((a,b)=>ranking==="recent"
    ?b.verifiedAt.localeCompare(a.verifiedAt)
      || compareAmounts(a,b) || a.title.localeCompare(b.title,"fr")
    :compareAmounts(a,b)
      || b.verifiedAt.localeCompare(a.verifiedAt)
      || a.title.localeCompare(b.title,"fr"));
  return {total:scoped.length,items:scoped.slice(0,count),sort:ranking};
}

// This shortlist contains only identifiers. It never stores unverified
// merchant claims, checkout prices or geographical coordinates. A saved ID
// cannot revalidate a refund after its review window has elapsed.
const SAVED_REFUND_ID=/^(?:coupon-network|shopmium)-[a-z0-9][a-z0-9._:-]{0,170}$/i;
export function normalizeSavedFoodRefundIds(raw){
  let values=raw;
  if(typeof raw==="string"){
    if(raw.length>12000) return [];
    try{values=JSON.parse(raw);}catch{return [];}
  }
  if(!Array.isArray(values)) return [];
  const seen=new Set();
  const result=[];
  for(const value of values){
    if(typeof value!=="string" || !SAVED_REFUND_ID.test(value)
      || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if(result.length===40) break;
  }
  return result;
}

/** Resolve favourites against current source evidence and current store/channel.
 * Unknown/expired source IDs stay visible only as a count, never as deals.
 */
export function selectSavedFoodRefunds({
  savedIds=[],offers=[],store="carrefour",channel="store",now=new Date()
}={}){
  const ids=normalizeSavedFoodRefundIds(savedIds);
  const live=selectFoodRefundOpportunities({
    offers,store,channel,now,limit:240
  }).items;
  const matching=new Map(live.map((offer)=>[offer.id,offer]));
  const available=ids.map((id)=>matching.get(id)).filter(Boolean);
  return {total:ids.length,available,unavailableCount:ids.length-available.length};
}

/**
 * Text-only shopping-time verification list. Never assert that a refund is
 * activated, stackable, payable or affordable. Do not export hidden/expired
 * bookmarks or any device location or local checkout-price history.
 */
export function formatSavedFoodRefundChecklist(items,{store="carrefour"}={}){
  const entries=Array.isArray(items)?items.slice(0,40):[];
  const shop=store==="leclerc"?"E.Leclerc":"Carrefour";
  const lines=[
    "Remboursements alimentaires à vérifier — "+shop,
    "Liste indicative, aucun remboursement garanti.",
    "Avant achat : vérifier EAN, magasin, dates, activation, exclusions, ticket et cumul."
  ];
  for(const [index,item] of entries.entries()){
    if(!item || typeof item.title!=="string" || typeof item.sourceUrl!=="string") continue;
    // Keep each item on one line and do not include arbitrary URLs.
    const title=item.title.replace(/[\r\n\t]+/g," ").trim().slice(0,180);
    const provider=String(item.provider||"Source").replace(/[\r\n\t]+/g," ").trim().slice(0,80);
    let url;
    try{
      const parsed=new URL(item.sourceUrl);
      if(parsed.protocol!=="https:" || parsed.username || parsed.password) continue;
      url=parsed.href;
    }catch{continue;}
    if(!title) continue;
    lines.push((index+1)+". "+title+" ("+provider+")");
    lines.push("Conditions officielles : "+url);
  }
  return lines.join("\n");
}

export function selectDailyCatalogue({
  offers=[],campaigns=[],store="carrefour",channel="store",now=new Date(),
  limit=8,sort="percent",maxSpend=null
}={}){
  const current=new Date(now);
  const today=parisCivilDay(current);
  const safeLimit=Number.isInteger(limit)?Math.max(1,Math.min(limit,30)):8;
  const ranking=["percent","euros","budget","net"].includes(sort)?sort:"percent";
  const budget=Number.isFinite(maxSpend) && maxSpend>0
    ? Math.round(maxSpend*100)/100 : null;
  const scoped=filterOffers(
    filterActiveOffers(offers,current).filter((offer)=>
      isOfferWithinShoppingScope(offer) && offer.scope==="produit"),
    {store,channel,search:""}
  );
  // A source outage must not silently promote an old campaign back into
  // the verified rankings. It can, however, supply an explicitly labelled
  // shopping-time verification lead while the *original* campaign remains
  // in its advertised validity window. Never use a stale price as evidence
  // that the product meets the shopper's current cash budget.
  const eligible=scoped.filter((offer)=>!offer.sourceSyncWarning);
  const pending=scoped.filter((offer)=>offer.providerId===store
    && Boolean(offer.sourceSyncWarning));
  const pendingPicks=pending.map((offer)=>{
    const original=normalizePick(offer);
    return {
      ...original,
      // Historical amounts are not current prices, even if numerically
      // precise. Keep them separate and name them explicitly.
      savingAmount:null,savingPercent:null,basePrice:null,upfrontCost:null,
      netAfterBenefit:null,
      historicalRate:original.savingPercent,
      historicalSavingAmount:original.savingAmount,
      historicalUpfront:original.upfrontCost,
      lastProofAt:offer.verifiedAt,
      lastAttemptAt:offer.sourceSyncWarning?.checkedAt || null,
      advertisedUntil:offer.expiresAt || null,
      needsReconfirmation:true
    };
  });
  const unconfirmed=budget===null
    ?pendingPicks.sort((a,b)=>
      Number(b.hasExactEan)-Number(a.hasExactEan)
      || orderOffers({...a,savingPercent:a.historicalRate,
          savingAmount:a.historicalSavingAmount,
          upfrontCost:a.historicalUpfront},
        {...b,savingPercent:b.historicalRate,
          savingAmount:b.historicalSavingAmount,
          upfrontCost:b.historicalUpfront},ranking)
    ).slice(0,safeLimit) : [];
  const picks=eligible.map(normalizePick).filter((item)=>affordable(item,budget));
  const retailer=picks.filter((item)=>item.providerId===store)
    .sort((a,b)=>orderOffers(a,b,ranking)).slice(0,safeLimit);
  const extra=picks.filter((item)=>item.providerId!==store)
    .sort((a,b)=>orderOffers(a,b,ranking)).slice(0,safeLimit);
  // Highlights are genuine dated product candidates only, deduplicated,
  // not speculative campaign maxima or inferred basket stacking savings.
  const highlights=pickActionableDailyDeals(picks,{sort:ranking,limit:3});
  const seen=new Set();
  // A small budget should first show low-priced food *leads*, not bury
  // them behind large headline percentages for unspecified product sets.
  // This editorial priority does not validate any item-level shelf price.
  const budgetLeadPriority=(item)=>{
    if(/^carrefour-public-lead-legumes-099-\d{8}$/.test(item.id)) return 3;
    if(/^carrefour-public-lead-quotidien-1-\d{8}$/.test(item.id)) return 2;
    if(/^carrefour-public-lead-bio-2-\d{8}$/.test(item.id)) return 1;
    return 0;
  };
  const campaignCandidates=(Array.isArray(campaigns)?campaigns:[])
    .map((raw)=>safeCampaign(raw,today,store,channel)).filter(Boolean)
    .filter((entry)=>budget===null || entry.minimumPurchase===null
      || entry.minimumPurchase<=budget)
    .filter((entry)=>!seen.has(entry.id) && Boolean(seen.add(entry.id)))
    // Rank by illustrative full-lot ceiling rather than advertising the
    // second item's headline percentage as if it applied to the basket.
    .sort((a,b)=>(budget!==null
      ? budgetLeadPriority(b)-budgetLeadPriority(a) : 0)
      || (b.illustrativeBasketPercent??-1)
      -(a.illustrativeBasketPercent??-1)
      || Number(b.advertisedPrice!==null)-Number(a.advertisedPrice!==null)
      || a.expiresAt.localeCompare(b.expiresAt)
      || a.title.localeCompare(b.title,"fr"));
  // The price-sighting shortlist is independent of the general marketing
  // campaign limit. A high maximum headline percentage must not bury a
  // known €/kg food price, including when the UI asks for only one item.
  const discovery=campaignCandidates.slice(0,safeLimit);
  // A named produce advertisement with a stated unit price is more useful
  // for a tight food budget than a generic "% on the 2nd item" banner.
  // These are editorial observations only: €/kg is NOT the price of a
  // basket of unknown weight, and no former/reference price is documented.
  // No EAN, cashback, affordability verdict or inferred savings are created.
  const priceSpots=campaignCandidates
    .filter((item)=>Number.isFinite(item.advertisedPrice)
      && ["kg","pièce"].includes(item.priceUnit)
      && item.offerMechanism===null
      && item.advertisedMaxPercent===null
      && item.category==="fruits et légumes")
    .sort((a,b)=>a.priceUnit.localeCompare(b.priceUnit,"fr")
      || a.advertisedPrice-b.advertisedPrice
      || a.title.localeCompare(b.title,"fr"))
    .slice(0,safeLimit);
  return {today,store,channel,retailer,extra,campaigns:discovery,
    priceSpots,highlights,
    // Explicitly excluded from highlights, merchant "verified" cards and
    // any basket savings. This is a bounded verification-only shortlist.
    unconfirmed,unconfirmedRetailerCount:pendingPicks.length,
    sort:ranking,maxSpend:budget,
    affordableCandidates:picks.length,
    exactRetailerCount:retailer.filter((item)=>item.hasExactEan).length};
}

// The advertised campaign's expiry is not the time of the last successful
// scrape. A green scheduled workflow may have received HTTP 403; make that
// gap visible in the Android UI without changing any individual offer proof.
export function dailyCampaignRefreshNotice(feed={},store="carrefour",now=new Date()){
  const today=parisCivilDay(new Date(now));
  const attempt=Date.parse(feed?.lastAttemptAt||"");
  const latest=Date.parse(feed?.checkedAt||"");
  const attemptedDay=Number.isFinite(attempt) && attempt<=new Date(now).getTime()
    ?parisCivilDay(new Date(attempt)):null;
  const proofDay=Number.isFinite(latest) && latest<=new Date(now).getTime()
    ?parisCivilDay(new Date(latest)):null;
  const vendor=store==="leclerc"?"E.Leclerc":"Carrefour";
  const proofText=proofDay
    ? "Dernière preuve de campagne collectée : "+proofDay+"."
    : "Aucune preuve de campagne récente confirmée.";
  if(attemptedDay!==today)
    return "Aucun contrôle automatique des catalogues du jour enregistré pour "+
      today+". "+proofText+" Ouvrez le prospectus officiel pour vérifier les offres.";
  const checks=Object.entries(feed?.sourceChecks||{})
    .filter(([url,value])=>(store==="leclerc"
      ?url.startsWith("https://nos-catalogues-promos-v2.e.leclerc/catalog/")
      :["https://www.carrefour.fr/offres-du-moment",
         "https://www.carrefour.fr/catalogue/carrefour"].includes(url))
      && ["available","unavailable"].includes(value?.status))
    .map(([,value])=>value.status);
  if(!checks.length)
    return vendor+" : aucune lecture de source officielle enregistrée aujourd'hui. "+
      proofText+" Vérifiez le catalogue manuellement.";
  if(checks.every((status)=>status==="unavailable"))
    return vendor+" : lecture automatique du catalogue indisponible aujourd'hui ("+
      today+"). "+proofText+
      " Les anciennes annonces ne sont pas des promotions reconfirmées.";
  if(checks.includes("unavailable"))
    return vendor+" : lecture partielle des sources officielles aujourd'hui ("+
      today+"). "+proofText+
      " Certaines opérations restent à vérifier manuellement.";
  return vendor+" : page(s) officielles consultée(s) aujourd'hui ("+today+
    "), sans garantie de prix local. "+proofText;
}
