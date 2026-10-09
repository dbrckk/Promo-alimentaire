import {canonicalGtin} from "./gtin.js";
import {isOfferActive} from "./ingestion.js";
import {estimateOfferSaving,matchOfferToProduct,requiredQuantity} from "./matching.js";
import {haversineKm,isUnambiguousRetailer,selectBestRecentPrice} from "./open-data.js";
import {validateRetailerGtinEvidence} from "./retailer-ean-evidence.js";

const STORES=["carrefour","leclerc"];
const round=(value)=>Math.round((value+Number.EPSILON)*100)/100;

const DAY_MS=24*60*60*1000;
const normalizedPlace=(value)=>String(value??"").trim()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g," ").trim();

function geographicEvidence(a,b){
  const distance=haversineKm(a?.locationLat,a?.locationLon,b?.locationLat,b?.locationLon);
  if(Number.isFinite(distance)){
    return distance<=15
      ? {ok:true,method:"coordinates",distanceKm:Math.round(distance*10)/10}
      : {ok:false,status:"too-far",distanceKm:Math.round(distance*10)/10};
  }
  // Without coordinates, full postcode AND town must match. A shared retailer
  // label or just the name of a large city is not enough spatial evidence.
  const zipA=String(a?.postcode??"").trim(),zipB=String(b?.postcode??"").trim();
  const cityA=normalizedPlace(a?.city),cityB=normalizedPlace(b?.city);
  if(/^\d{5}$/.test(zipA) && zipA===zipB && cityA && cityA===cityB){
    return {ok:true,method:"postcode",distanceKm:null};
  }
  return {ok:false,status:"location-unverified",distanceKm:null};
}

/**
 * A price winner is shown only for comparable nearby stores, recent receipts
 * and close observations in time. This is NOT a current price guarantee.
 */
export function comparePriceObservationEvidence(a,b,now=new Date()){
  if(!a || !b) return {comparable:false,status:"missing-price",dateGapDays:null,distanceKm:null};
  const current=new Date(now);
  const dates=[new Date(a.date),new Date(b.date)];
  if(Number.isNaN(current.getTime()) || dates.some((date)=>Number.isNaN(date.getTime()))){
    return {comparable:false,status:"invalid-date",dateGapDays:null,distanceKm:null};
  }
  const ages=dates.map((date)=>(current.getTime()-date.getTime())/DAY_MS);
  if(ages.some((days)=>days<0 || days>7)){
    return {comparable:false,status:"observations-old",dateGapDays:null,distanceKm:null};
  }
  const dateGapDays=Math.round(Math.abs(dates[0]-dates[1])/DAY_MS*10)/10;
  if(dateGapDays>3){
    return {comparable:false,status:"dates-too-far",dateGapDays,distanceKm:null};
  }
  const location=geographicEvidence(a,b);
  if(!location.ok){
    return {comparable:false,status:location.status,dateGapDays,
      distanceKm:location.distanceKm};
  }
  return {comparable:true,status:"comparable",dateGapDays,
    distanceKm:location.distanceKm,method:location.method};
}

/**
 * Choose a pair of verifiable receipts without cherry-picking low prices.
 * First prefer the most recent date shared by both receipts, then the
 * smallest date gap; never use the price difference to favour a store.
 *
 * Inputs must already be filtered to the same GTIN, retailer, unit/currency.
 */
export function selectComparableObservationPair(carrefourObservations=[],leclercObservations=[],now=new Date()){
  const recent=(items)=>(Array.isArray(items)?items:[])
    .filter((item)=>{
      if(!item?.date || !Number.isFinite(Number(item.price)) || Number(item.price)<=0) return false;
      const when=new Date(item.date).getTime();
      const age=new Date(now).getTime()-when;
      return Number.isFinite(age) && age>=0 && age<=7*DAY_MS;
    })
    .sort((a,b)=>{
      const dateDiff=new Date(b.date)-new Date(a.date);
      if(dateDiff!==0) return dateDiff;
      // Conservative deterministic tie-break for contradictory same-day data.
      return Number(b.price)-Number(a.price);
    })
    .slice(0,100);
  const carrefour=recent(carrefourObservations);
  const leclerc=recent(leclercObservations);
  let best=null;
  let rank=null;
  for(const a of carrefour){
    for(const b of leclerc){
      const evidence=comparePriceObservationEvidence(a,b,now);
      if(!evidence.comparable) continue;
      const aTime=new Date(a.date).getTime(),bTime=new Date(b.date).getTime();
      const candidateRank=[
        Math.min(aTime,bTime),
        -Math.abs(aTime-bTime),
        Math.max(aTime,bTime),
        Number(Boolean(a.proofType))+Number(Boolean(b.proofType)),
        Number(a.price)+Number(b.price)
      ];
      const better=!rank || candidateRank.some((v,i)=>
        v!==rank[i] && candidateRank.slice(0,i).every((q,j)=>q===rank[j]) && v>rank[i]
      );
      if(better){
        best={carrefour:a,leclerc:b,evidence};
        rank=candidateRank;
      }
    }
  }
  return best;
}

/**
 * Compare a single validated GTIN across two retailers. No brand-only
 * suggestion can become an exact promotion. Open Prices receipts are
 * independent observations, not live store inventory or Drive prices.
 */
export function compareExactSku(product,offers,priceObservationsByStore,{
  channel="store",quantity=1,now=new Date()
}={}){
  const gtin=canonicalGtin(product?.code);
  if(!gtin) return {status:"invalid-gtin",gtin:null,stores:[]};
  const qty=Number(quantity);
  if(!Number.isInteger(qty) || qty<1 || qty>100) {
    return {status:"invalid-quantity",gtin,stores:[]};
  }
  const observedByStore={};
  const rows=STORES.map((store)=>{
    const observations=Array.isArray(priceObservationsByStore?.[store])
      ? priceObservationsByStore[store] : [];
    const own=observations.filter((item)=>
      canonicalGtin(item?.productCode)===gtin
      && isUnambiguousRetailer(item?.retailerText,store)
      && (item.currency===undefined || item.currency==="EUR")
      && (item.pricePer===undefined || item.pricePer==="UNIT")
    );
    observedByStore[store]=own;
    // Open Prices is generally a checkout/shelf observation. Do not
    // silently substitute those prices for Drive or delivery quotations.
    const observed=channel==="store"
      ? selectBestRecentPrice(own,30,now) : null;
    const price=observed ? Number(observed.price) : null;

    const exactOffers=(offers || [])
      .filter((offer)=>offer?.scope==="produit")
      .filter((offer)=>isOfferActive(offer,now))
      .filter((offer)=>offer.stores?.includes(store)||offer.stores?.includes("all"))
      .filter((offer)=>{
        const channels=Array.isArray(offer.channels) ? offer.channels : [];
        return channels.length===0 || channels.includes(channel) || channels.includes("all");
      })
      .filter((offer)=>matchOfferToProduct({code:product.code},offer).exact)
      .map((offer)=>{
        const minQuantity=requiredQuantity(offer);
        // A discounted observation could already include a retailer promo;
        // subtracting it again would systematically overstate savings.
        const alreadyDiscounted=observed?.isDiscounted===true;
        const needsCurrentRetailerPrice=["retailer_promo","retailer_loyalty"].includes(offer.mechanism)
          || offer.requiresChannelPriceVerification===true
          || offer.requiresStoreVerification===true;
        const canSimulate=price!==null && !alreadyDiscounted
          && qty>=minQuantity && !needsCurrentRetailerPrice;
        const estimate=canSimulate ? estimateOfferSaving(price,offer,qty) : null;
        const saving=Number.isFinite(estimate) ? round(estimate) : null;
        const retailerProof=offer.providerId===store
          && validateRetailerGtinEvidence({
            providerId:store,eans:offer.eans,eanEvidenceUrl:offer.eanEvidenceUrl
          }).ok;
        return {
          id:offer.id,title:offer.title,provider:offer.provider,
          sourceUrl:offer.sourceUrl,eanEvidenceUrl:offer.eanEvidenceUrl||null,
          retailerProof,conditional:true,minQuantity,
          saving,amountAfterRefund:saving!==null ? round(price*qty-saving) : null,
          status:alreadyDiscounted?"already-discounted"
            : needsCurrentRetailerPrice?"retailer-price-required"
              : qty<minQuantity?"quantity-required"
                : price===null?"price-unknown"
                  : saving===null?"not-calculable":"estimated"
        };
      }).sort((a,b)=>{
        if(a.saving!==null && b.saving===null) return -1;
        if(b.saving!==null && a.saving===null) return 1;
        if(a.saving!==null && b.saving!==null && a.saving!==b.saving){
          return b.saving-a.saving;
        }
        return String(a.title).localeCompare(String(b.title),"fr");
      });
    const initialCost=price!==null?round(price*qty):null;
    // Alternative promotions are independent and may be incompatible:
    // never sum several refunds or apply them as guaranteed savings.
    const bestCandidate=exactOffers.find((offer)=>offer.saving!==null)||null;
    return {
      store,channel,price,observation:observed,
      initialCost,exactOffers,
      exactCount:exactOffers.length,
      potentialSaving:bestCandidate?.saving??null,
      possibleNetCost:bestCandidate?.amountAfterRefund??null,
      comparisonAvailable:price!==null,
      note:channel!=="store"
        ? "Aucun prix magasin réutilisé comme prix Drive/livraison."
        : price===null
          ? "Pas de relevé communautaire récent (30 jours) pour cet EAN dans cette enseigne."
          : "Prix communautaire daté, non contractuel ; vérifier le prix du magasin."
    };
  });
  // A latest receipt in another town need not discard a valid same-area
  // pair from the previous days. Comparison uses the dated pair, while store
  // cards continue to show each chain's actual latest observed price.
  const pair=channel==="store"
    ? selectComparableObservationPair(observedByStore.carrefour,observedByStore.leclerc,now)
    : null;
  const evidence=pair?.evidence || comparePriceObservationEvidence(
    rows[0].observation,rows[1].observation,now
  );
  const comparedPrices=pair ? {
    carrefour:{price:Number(pair.carrefour.price),observation:pair.carrefour},
    leclerc:{price:Number(pair.leclerc.price),observation:pair.leclerc}
  } : null;
  let lowerObservedStore=null;
  if(comparedPrices){
    if(comparedPrices.carrefour.price<comparedPrices.leclerc.price) lowerObservedStore="carrefour";
    if(comparedPrices.leclerc.price<comparedPrices.carrefour.price) lowerObservedStore="leclerc";
  }
  const observedPriceDifference=comparedPrices
    ? round(Math.abs(comparedPrices.carrefour.price-comparedPrices.leclerc.price)) : null;
  const comparisonUsesOlderReceipts=Boolean(pair
    && (pair.carrefour!==rows[0].observation || pair.leclerc!==rows[1].observation));
  return {status:"ok",gtin,quantity:qty,channel,
    lowerObservedStore,comparisonEvidence:evidence,
    comparedPrices,comparisonUsesOlderReceipts,
    observedPriceDifference,stores:rows};
}
