import {canonicalGtin} from "./gtin.js";
import {isOfferActive} from "./ingestion.js";
import {estimateOfferSaving,matchOfferToProduct,requiredQuantity} from "./matching.js";
import {isUnambiguousRetailer,selectBestRecentPrice} from "./open-data.js";
import {validateRetailerGtinEvidence} from "./retailer-ean-evidence.js";

const STORES=["carrefour","leclerc"];
const round=(value)=>Math.round((value+Number.EPSILON)*100)/100;

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
  const comparable=rows.filter((row)=>row.comparisonAvailable);
  let lowerObservedStore=null;
  if(comparable.length===2){
    if(comparable[0].price<comparable[1].price) lowerObservedStore=comparable[0].store;
    if(comparable[1].price<comparable[0].price) lowerObservedStore=comparable[1].store;
  }
  return {status:"ok",gtin,quantity:qty,channel,
    lowerObservedStore,stores:rows};
}
