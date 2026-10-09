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
 * Compare a single validated GTIN across two retailers. No brand-only
 * suggestion can become an exact promotion. Open Prices receipts are
 * independent observations, not live store inventory or Drive prices.
 */
export function compareExactSku(product,offers,priceObservationsByStore,{
  channel="store",quantity=1,now=new Date()
}={}){
  const gtin=canonicalGtin(product?.code);
  if(!gtin) return {status:"invalid-gtin",gtin:null,stores:[]};
  const qty=Math.trunc(Number(quantity));
  if(!Number.isInteger(qty) || qty<1 || qty>100) {
    return {status:"invalid-quantity",gtin,stores:[]};
  }
  const rows=STORES.map((store)=>{
    const observations=Array.isArray(priceObservationsByStore?.[store])
      ? priceObservationsByStore[store] : [];
    const own=observations.filter((item)=>
      canonicalGtin(item?.productCode)===gtin
      && isUnambiguousRetailer(item?.retailerText,store)
      && (item.currency===undefined || item.currency==="EUR")
      && (item.pricePer===undefined || item.pricePer==="UNIT")
    );
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
  const evidence=comparePriceObservationEvidence(
    rows[0].observation,rows[1].observation,now
  );
  let lowerObservedStore=null;
  if(evidence.comparable){
    if(rows[0].price<rows[1].price) lowerObservedStore=rows[0].store;
    if(rows[1].price<rows[0].price) lowerObservedStore=rows[1].store;
  }
  const observedPriceDifference=evidence.comparable
    ? round(Math.abs(rows[0].price-rows[1].price)) : null;
  return {status:"ok",gtin,quantity:qty,channel,
    lowerObservedStore,comparisonEvidence:evidence,
    observedPriceDifference,stores:rows};
}
