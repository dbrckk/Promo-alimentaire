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
 * Keep the most recent comparable pair of receipts, not necessarily the
 * independently most recent receipt from each chain. Prefer recency and
 * geographical closeness; NEVER choose a pair because one price is cheaper.
 * The receipt list is already filtered to the requested retailer + GTIN.
 */
export function selectComparablePricePair(carrefourObservations,leclercObservations,now=new Date()){
  const current=new Date(now);
  if(Number.isNaN(current.getTime())) return null;
  const lastWeek=(observations)=>(observations||[]).filter((observation)=>{
    if(!observation?.date || !Number.isFinite(Number(observation.price))
      || Number(observation.price)<=0) return false;
    const timestamp=new Date(observation.date).getTime();
    const age=current.getTime()-timestamp;
    return Number.isFinite(timestamp) && age>=0 && age<=7*DAY_MS;
  });
  const candidatesA=lastWeek(carrefourObservations);
  const candidatesB=lastWeek(leclercObservations);
  // Maintain only the leading pair. Building and sorting every candidate
  // pair can allocate tens of thousands of objects on an Android browser.
  // Preserve the previous sort priority and stable first-seen tie behavior.
  function outranks(a,b){
    if(a.oldestAt!==b.oldestAt) return a.oldestAt>b.oldestAt;
    if(a.newestAt!==b.newestAt) return a.newestAt>b.newestAt;
    const dA=a.evidence.distanceKm, dB=b.evidence.distanceKm;
    if(dA!==null && dB!==null && dA!==dB) return dA<dB;
    if((dA!==null)!==(dB!==null)) return dA!==null;
    const proofsA=Number(Boolean(a.carrefour.proofType))+Number(Boolean(a.leclerc.proofType));
    const proofsB=Number(Boolean(b.carrefour.proofType))+Number(Boolean(b.leclerc.proofType));
    if(proofsA!==proofsB) return proofsA>proofsB;
    // For tied dates/distances, remain conservative about conflicting
    // receipts rather than selecting the lowest reported shelf price.
    if(Number(a.carrefour.price)!==Number(b.carrefour.price)){
      return Number(a.carrefour.price)>Number(b.carrefour.price);
    }
    if(Number(a.leclerc.price)!==Number(b.leclerc.price)){
      return Number(a.leclerc.price)>Number(b.leclerc.price);
    }
    return (String(a.carrefour.id||"")+"|"+String(a.leclerc.id||""))
      .localeCompare(String(b.carrefour.id||"")+"|"+String(b.leclerc.id||""))<0;
  }
  let best=null;
  for(const carrefour of candidatesA){
    for(const leclerc of candidatesB){
      const evidence=comparePriceObservationEvidence(carrefour,leclerc,current);
      if(!evidence.comparable) continue;
      const aTime=new Date(carrefour.date).getTime();
      const bTime=new Date(leclerc.date).getTime();
      const candidate={carrefour,leclerc,evidence,
        oldestAt:Math.min(aTime,bTime),
        newestAt:Math.max(aTime,bTime)
      };
      if(!best || outranks(candidate,best)) best=candidate;
    }
  }
  return best;
}

/**
 * Surface why a retailer price is missing without confusing coverage with
 * actual availability or claiming that the retailer does not sell this SKU.
 */
export function priceCoverageSummary(observations,now=new Date(),lookup={}){
  const records=Array.isArray(observations)?observations:[];
  const lookupInterrupted=lookup?.partial===true;
  const moreAvailable=lookup?.moreAvailable===true;
  const pagesFetched=Number.isInteger(lookup?.pagesFetched)
    ? lookup.pagesFetched : null;
  const nowTime=new Date(now).getTime();
  const valid=records.filter((record)=>{
    if(!record || !Number.isFinite(Number(record.price))
      || Number(record.price)<=0 || !record.date) return false;
    const timestamp=new Date(record.date).getTime();
    // Future-dated, invalid or missing receipts must not inflate coverage
    // or masquerade as a recent observed price.
    return Number.isFinite(timestamp) && Number.isFinite(nowTime)
      && timestamp>0 && timestamp<=nowTime;
  });
  const recent=valid.filter((record)=>{
    const age=nowTime-new Date(record.date).getTime();
    return age<=30*DAY_MS;
  });
  const comparable=recent.filter((record)=>{
    const age=nowTime-new Date(record.date).getTime();
    return age<=7*DAY_MS;
  });
  return {
    total:records.length,valid:valid.length,
    recent30Days:recent.length,recent7Days:comparable.length,
    pagesFetched,lookupInterrupted,moreAvailable,
    searchIncomplete:lookupInterrupted || moreAvailable,
    latestDate:valid.length
      ? valid.map((record)=>record.date).sort().at(-1) : null,
    status:records.length===0?"no-observation"
      : valid.length===0?"invalid-observations"
        : recent.length===0?"stale-observations"
          : comparable.length===0?"recent-but-not-comparable"
            : "recent"
  };
}

/**
 * Compare a single validated GTIN across two retailers. No brand-only
 * suggestion can become an exact promotion. Open Prices receipts are
 * independent observations, not live store inventory or Drive prices.
 */
export function compareExactSku(product,offers,priceObservationsByStore,{
  channel="store",quantity=1,now=new Date(),coverageByStore={}
}={}){
  const gtin=canonicalGtin(product?.code);
  if(!gtin) return {status:"invalid-gtin",gtin:null,stores:[]};
  // A fractional quantity must be rejected, not silently rounded down.
  const qty=Number(quantity);
  if(!Number.isInteger(qty) || qty<1 || qty>100) {
    return {status:"invalid-quantity",gtin,stores:[]};
  }
  const comparableCandidates={carrefour:[],leclerc:[]};
  const rows=STORES.map((store)=>{
    const observations=Array.isArray(priceObservationsByStore?.[store])
      ? priceObservationsByStore[store] : [];
    const own=observations.filter((item)=>
      canonicalGtin(item?.productCode)===gtin
      && isUnambiguousRetailer(item?.retailerText,store)
      && (item.currency===undefined || item.currency==="EUR")
      && (item.pricePer===undefined || item.pricePer==="UNIT")
    );
    comparableCandidates[store]=own;
    const coverage=priceCoverageSummary(own,now,coverageByStore[store]);
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
      store,channel,price,observation:observed,coverage,
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
  const pair=channel==="store"
    ? selectComparablePricePair(
        comparableCandidates.carrefour,comparableCandidates.leclerc,now
      )
    : null;
  const evidence=pair?.evidence || comparePriceObservationEvidence(
    rows[0].observation,rows[1].observation,now
  );
  const pairPrices=pair
    ? {carrefour:Number(pair.carrefour.price),leclerc:Number(pair.leclerc.price)}
    : null;
  let lowerObservedStore=null;
  if(pairPrices){
    if(pairPrices.carrefour<pairPrices.leclerc) lowerObservedStore="carrefour";
    if(pairPrices.leclerc<pairPrices.carrefour) lowerObservedStore="leclerc";
  }
  const observedPriceDifference=pairPrices
    ? round(Math.abs(pairPrices.carrefour-pairPrices.leclerc)) : null;
  return {status:"ok",gtin,quantity:qty,channel,
    lowerObservedStore,comparisonEvidence:evidence,
    comparisonPair:pair ? {
      carrefour:pair.carrefour,leclerc:pair.leclerc
    } : null,
    observedPriceDifference,stores:rows};
}
