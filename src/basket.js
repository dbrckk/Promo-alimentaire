import { findProductOffers, estimateOfferSaving } from "./matching.js";
import { selectBestRecentPrice } from "./open-data.js";
import { optimizeStack } from "./stacking.js";
import { roundMoney } from "./domain.js";
import { findBundleCandidates } from "./bundle.js";
import {
  buildProductLoyaltyOffers,
  resolveOffersForLoyalty
} from "./loyalty.js";
import { applyLocalStoreConfirmations } from "./local-verification.js";
import { assessRetailerPromoPrice } from "./promo-price-check.js";

export function normalizeQuantity(value) {
  const quantity=Math.trunc(Number(value));
  if(!Number.isFinite(quantity) || quantity<1) return 1;
  return Math.min(quantity,99);
}

export function evaluateBasketStore(items,{
  store,
  channel=null,
  priceByCode={},
  offers=[],
  loyaltyProfile={},
  storeConfirmations=[],
  storeVerificationKey=null,
  now=new Date(),
  maxPriceAgeDays=120
}={}) {
  const resolvedOffers=applyLocalStoreConfirmations(
    resolveOffersForLoyalty(offers,loyaltyProfile),
    storeConfirmations,
    {store,locationKey:storeVerificationKey,channel:channel || "store",now}
  );
  const lines=(items || []).map((item)=>{
    const quantity=normalizeQuantity(item.quantity);
    const observations=priceByCode[item.product?.code] || [];
    const best=selectBestRecentPrice(observations,maxPriceAgeDays,now);
    const contextualOffers=buildProductLoyaltyOffers(item.product,{
      store,
      profile:loyaltyProfile
    });
    const matches=findProductOffers(
      item.product,
      [...resolvedOffers,...contextualOffers],
      {store,channel}
    );

    if(!best){
      return {
        code:item.product?.code || "",
        product:item.product,
        quantity,
        bestPrice:null,
        baseCost:null,
        finalCost:null,
        guaranteedSaving:0,
        potentialProductSaving:null,
        potentialAdditionalProductSaving:0,
        bestProductCandidate:null,
        bestSavingCandidate:null,
        matches,
        missingPrice:true
      };
    }

    const baseCost=roundMoney(best.price*quantity);
    // Open Prices records can already contain the retailer's discounted checkout price.
    // Never subtract the same retailer promo again from an already discounted observation.
    const alreadyRetailDiscounted=best.isDiscounted===true;
    const retailerPriceConflicts=matches
      .filter(({offer})=>offer.mechanism==="retailer_promo")
      .map(({offer})=>assessRetailerPromoPrice(best,offer))
      .filter((check)=>!check.eligible);
    const retailerPromoPriceConflict=retailerPriceConflicts.some((check)=>
      check.reason==="source-promo-may-already-be-included"
      || check.reason==="observed-price-not-source-regular"
    );
    const eligibleMatches=matches.filter(({offer})=>
      assessRetailerPromoPrice(best,offer).eligible
    );
    const guaranteedProductOffers=eligibleMatches
      .filter(({match,offer})=>match.exact && offer.autoStack===true)
      .map(({offer})=>{
        if(!offer.promoFormula) return offer;
        const exactSaving=estimateOfferSaving(best.price,offer,quantity);
        if(!Number.isFinite(exactSaving)) return {...offer,autoStack:false};
        return {
          ...offer,
          savingAmount:roundMoney(exactSaving),
          savingPercent:null,
          savingBasis:"base",
          calculatedFromPromoFormula:true
        };
      });
    const lineOptimization=optimizeStack(baseCost,guaranteedProductOffers,{store,channel});

    const potentialCandidates=eligibleMatches
      .map(({offer,match})=>({
        offer,
        match,
        saving:estimateOfferSaving(best.price,offer,quantity)
      }))
      .filter((candidate)=>Number.isFinite(candidate.saving))
      .map((candidate)=>({...candidate,saving:roundMoney(candidate.saving)}))
      .sort((a,b)=>{
        if(a.match.exact!==b.match.exact) return a.match.exact ? -1 : 1;
        if(a.saving!==b.saving) return b.saving-a.saving;
        return (b.match.score||0)-(a.match.score||0);
      });
    const bestProductCandidate=potentialCandidates[0] || null;
    const bestSavingCandidate=[...potentialCandidates]
      .sort((a,b)=>{
        if(a.saving!==b.saving) return b.saving-a.saving;
        if(a.match.exact!==b.match.exact) return a.match.exact ? -1 : 1;
        return (b.match.score||0)-(a.match.score||0);
      })[0] || null;
    const potentialProductSaving=bestSavingCandidate?.saving ?? null;
    // The safest hypothetical is to replace an already applied product benefit,
    // not subtract that benefit a second time.
    const potentialAdditionalProductSaving=roundMoney(Math.max(
      0,(potentialProductSaving || 0)-lineOptimization.totalSaving
    ));

    const loyaltyCredit=roundMoney(
      lineOptimization.selected
        .filter(isLoyaltyCredit)
        .reduce((sum,offer)=>sum+(offer.calculatedSaving||0),0)
    );
    const deferredRefund=roundMoney(
      lineOptimization.selected
        .filter(isDeferredRefund)
        .reduce((sum,offer)=>sum+(offer.calculatedSaving||0),0)
    );
    const immediateSaving=roundMoney(
      lineOptimization.totalSaving-loyaltyCredit-deferredRefund
    );
    const checkoutCost=roundMoney(Math.max(0,baseCost-immediateSaving));

    return {
      code:item.product?.code || "",
      product:item.product,
      quantity,
      bestPrice:best,
      baseCost,
      checkoutCost,
      loyaltyCredit,
      deferredRefund,
      immediateSaving,
      alreadyRetailDiscounted,
      retailerPromoPriceConflict,
      appliedOffers:lineOptimization.selected,
      finalCost:lineOptimization.finalCost,
      guaranteedSaving:lineOptimization.totalSaving,
      potentialProductSaving,
      potentialAdditionalProductSaving,
      bestProductCandidate,
      bestSavingCandidate,
      matches,
      missingPrice:false
    };
  });

  const pricedLines=lines.filter((line)=>!line.missingPrice);
  const missingLines=lines.filter((line)=>line.missingPrice);
  const observedSubtotal=roundMoney(pricedLines.reduce((sum,line)=>sum+line.baseCost,0));
  const productAdjustedSubtotal=roundMoney(pricedLines.reduce((sum,line)=>sum+line.finalCost,0));
  const basketOffers=resolvedOffers.filter((offer)=>offer.scope==="panier");
  const basketOptimization=productAdjustedSubtotal>0
    ? optimizeStack(productAdjustedSubtotal,basketOffers,{store,channel})
    : {finalCost:0,totalSaving:0,selected:[],considered:[],savingPercent:0};

  const bundleCandidates=findBundleCandidates(items,lines,resolvedOffers,{store,channel});
  const potentialBundleSaving=bundleCandidates.length
    ? roundMoney(Math.max(...bundleCandidates.map((candidate)=>candidate.saving)))
    : 0;
  // Bundles discount the target reference; subtract any benefit already counted
  // on that line before describing the bundle as additional saving.
  const potentialAdditionalBundleSaving=roundMoney(Math.max(
    0,...bundleCandidates.map((candidate)=>
      candidate.saving-(candidate.targetLine?.guaranteedSaving || 0)
    )
  ));

  const finalCost=roundMoney(basketOptimization.finalCost);
  const guaranteedSaving=roundMoney(observedSubtotal-finalCost);
  const productGuaranteedSaving=roundMoney(
    pricedLines.reduce((sum,line)=>sum+(line.guaranteedSaving||0),0)
  );
  const paymentGuaranteedSaving=roundMoney(
    basketOptimization.selected
      .filter((offer)=>offer.mechanism==="gift_card")
      .reduce((sum,offer)=>sum+(offer.calculatedSaving||0),0)
  );
  const basketLoyaltyCredit=roundMoney(
    basketOptimization.selected
      .filter(isLoyaltyCredit)
      .reduce((sum,offer)=>sum+(offer.calculatedSaving||0),0)
  );
  const basketDeferredRefund=roundMoney(
    basketOptimization.selected
      .filter(isDeferredRefund)
      .reduce((sum,offer)=>sum+(offer.calculatedSaving||0),0)
  );
  const otherBasketGuaranteedSaving=roundMoney(
    basketOptimization.selected
      .filter((offer)=>offer.mechanism!=="gift_card")
      .filter((offer)=>!isLoyaltyCredit(offer))
      .filter((offer)=>!isDeferredRefund(offer))
      .reduce((sum,offer)=>sum+(offer.calculatedSaving||0),0)
  );
  const productLoyaltyCredit=roundMoney(
    pricedLines.reduce((sum,line)=>sum+(line.loyaltyCredit||0),0)
  );
  const productDeferredRefund=roundMoney(
    pricedLines.reduce((sum,line)=>sum+(line.deferredRefund||0),0)
  );
  const productImmediateSaving=roundMoney(
    pricedLines.reduce((sum,line)=>sum+(line.immediateSaving||0),0)
  );
  const loyaltyCredit=roundMoney(productLoyaltyCredit+basketLoyaltyCredit);
  const deferredRefund=roundMoney(productDeferredRefund+basketDeferredRefund);
  const checkoutSaving=roundMoney(productImmediateSaving+otherBasketGuaranteedSaving);
  const checkoutCost=roundMoney(Math.max(0,observedSubtotal-checkoutSaving));
  const potentialProductSaving=roundMoney(pricedLines.reduce(
    (sum,line)=>sum+(line.potentialProductSaving || 0),0
  ));
  const potentialAdditionalProductSaving=roundMoney(pricedLines.reduce(
    (sum,line)=>sum+(line.potentialAdditionalProductSaving || 0),0
  ));
  const uncertainBasketCandidates=basketOptimization.considered
    .filter((offer)=>offer.autoStack!==true)
    .map((offer)=>({
      offer,
      saving:estimateBasketCandidateSaving(finalCost,offer)
    }))
    .filter((candidate)=>Number.isFinite(candidate.saving)&&candidate.saving>0)
    .sort((a,b)=>b.saving-a.saving);
  const potentialBasketSaving=uncertainBasketCandidates.length
    ? roundMoney(uncertainBasketCandidates[0].saving)
    : 0;
  const conservativePotentialExtraSaving=roundMoney(
    Math.max(potentialAdditionalProductSaving,potentialAdditionalBundleSaving,potentialBasketSaving)
  );
  const conservativeBestCaseCost=roundMoney(
    Math.max(0,finalCost-conservativePotentialExtraSaving)
  );

  return {
    store,
    channel,
    lines,
    itemCount:lines.reduce((sum,line)=>sum+line.quantity,0),
    distinctCount:lines.length,
    pricedCount:pricedLines.length,
    missingCount:missingLines.length,
    isComplete:lines.length>0 && missingLines.length===0,
    observedSubtotal,
    productAdjustedSubtotal,
    basketOptimization,
    checkoutCost,
    loyaltyCredit,
    deferredRefund,
    finalCost,
    guaranteedSaving,
    savingPercent:observedSubtotal>0
      ? Math.round((guaranteedSaving/observedSubtotal)*10000)/100
      : 0,
    potentialProductSaving,
    potentialBundleSaving,
    potentialAdditionalProductSaving,
    potentialAdditionalBundleSaving,
    savingsBreakdown:{
      productGuaranteed:productGuaranteedSaving,
      productImmediateGuaranteed:productImmediateSaving,
      loyaltyGuaranteed:loyaltyCredit,
      refundGuaranteed:deferredRefund,
      checkoutGuaranteed:checkoutSaving,
      paymentGuaranteed:paymentGuaranteedSaving,
      otherBasketGuaranteed:otherBasketGuaranteedSaving,
      productPotential:potentialProductSaving,
      bundlePotential:potentialBundleSaving,
      productPotentialExtra:potentialAdditionalProductSaving,
      bundlePotentialExtra:potentialAdditionalBundleSaving,
      basketPotential:potentialBasketSaving,
      uncertainBasketCount:basketOptimization.considered.filter((offer)=>offer.autoStack!==true).length
    },
    uncertainBasketCandidates,
    conservativePotentialExtraSaving,
    conservativeBestCaseCost,
    bundleCandidates
  };
}

export function compareBasketStores(scenarios) {
  const valid=(scenarios || []).filter((scenario)=>scenario && scenario.distinctCount>0);
  const complete=valid.filter((scenario)=>scenario.isComplete);
  if(complete.length){
    return [...complete].sort((a,b)=>a.finalCost-b.finalCost);
  }
  return [...valid].sort((a,b)=>{
    if(a.pricedCount!==b.pricedCount) return b.pricedCount-a.pricedCount;
    return a.finalCost-b.finalCost;
  });
}


export function observationLocationKey(observation) {
  if(!observation) return null;
  if(observation.locationId!==null && observation.locationId!==undefined
    && String(observation.locationId).trim()) {
    return `id:${String(observation.locationId).trim()}`;
  }
  const validCoordinate=(value,min,max)=>
    value!==null && value!==undefined && value!==""
    && Number.isFinite(Number(value))
    && Number(value)>=min && Number(value)<=max;
  if(validCoordinate(observation.locationLat,-90,90)
    && validCoordinate(observation.locationLon,-180,180)){
    return `geo:${Number(observation.locationLat).toFixed(5)},${Number(observation.locationLon).toFixed(5)}`;
  }
  // Only form an indicative text key when both the store name and postcode
  // are present. A generic chain name alone is not a physical store identity.
  const name=String(observation.storeName || "").trim().toLocaleLowerCase("fr");
  const postcode=String(observation.postcode || "").trim();
  if(!name || !/^\d{5}$/.test(postcode)) return null;
  return `text:${name}|${postcode}`;
}

export function evaluateBasketLocations(items,{
  store,
  channel=null,
  priceByCode={},
  offers=[],
  loyaltyProfile={},
  storeConfirmations=[],
  now=new Date(),
  maxPriceAgeDays=120
}={}) {
  const locations=new Map();

  for(const item of items || []){
    const code=item.product?.code;
    for(const observation of priceByCode[code] || []){
      const key=observationLocationKey(observation);
      if(!key) continue;
      if(!locations.has(key)){
        locations.set(key,{
          key,
          location:{
            id:observation.locationId ?? null,
            name:observation.storeName || "",
            city:observation.city || "",
            postcode:observation.postcode || "",
            distanceKm:Number.isFinite(observation.distanceKm) ? observation.distanceKm : null
          },
          priceByCode:{}
        });
      }
      const entry=locations.get(key);
      if(!entry.priceByCode[code]) entry.priceByCode[code]=[];
      entry.priceByCode[code].push(observation);
      if(Number.isFinite(observation.distanceKm)){
        if(!Number.isFinite(entry.location.distanceKm) || observation.distanceKm<entry.location.distanceKm){
          entry.location.distanceKm=observation.distanceKm;
        }
      }
    }
  }

  return [...locations.values()].map((entry)=>({
    ...evaluateBasketStore(items,{
      store,
      channel,
      priceByCode:entry.priceByCode,
      offers,
      loyaltyProfile,
      storeConfirmations,
      storeVerificationKey:entry.key,
      now,
      maxPriceAgeDays
    }),
    locationKey:entry.key,
    location:entry.location
  }));
}

export function selectBestLocationScenario(scenarios) {
  const values=(scenarios || []).filter(Boolean);
  if(!values.length) return null;
  const complete=values.filter((scenario)=>scenario.isComplete);
  const pool=complete.length ? complete : values;
  return [...pool].sort((a,b)=>{
    if(a.isComplete!==b.isComplete) return a.isComplete ? -1 : 1;
    if(a.pricedCount!==b.pricedCount) return b.pricedCount-a.pricedCount;
    if(a.finalCost!==b.finalCost) return a.finalCost-b.finalCost;
    const da=Number.isFinite(a.location?.distanceKm) ? a.location.distanceKm : Infinity;
    const db=Number.isFinite(b.location?.distanceKm) ? b.location.distanceKm : Infinity;
    return da-db;
  })[0];
}


export function estimateBasketCandidateSaving(baseCost,offer){
  const base=Number(baseCost);
  if(!Number.isFinite(base)||base<=0||!offer) return null;
  if(Number.isFinite(offer.savingAmount)){
    return roundMoney(Math.min(base,Math.max(0,Number(offer.savingAmount))));
  }
  if(Number.isFinite(offer.savingPercent)){
    return roundMoney(Math.min(base,base*Number(offer.savingPercent)/100));
  }
  return null;
}


function isLoyaltyCredit(offer){
  return offer?.rewardType==="loyalty_credit"
    || offer?.benefitTiming==="wallet"
    || offer?.mechanism==="retailer_loyalty";
}

function isDeferredRefund(offer){
  return offer?.benefitTiming==="refund"
    || offer?.mechanism==="odr"
    || offer?.mechanism==="cashback_ticket";
}
