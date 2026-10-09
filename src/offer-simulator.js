import {estimateOfferSaving,requiredQuantity} from "./matching.js";

function money(value){
  return Math.round((Number(value)+Number.EPSILON)*100)/100;
}

export function parseSimulatedUnitPrice(raw){
  if(typeof raw!=="string" && typeof raw!=="number") return null;
  const value=String(raw).trim().replace(/\s/g,"").replace(",",".");
  if(!/^(?:\d{1,5})(?:\.\d{1,2})?$/.test(value)) return null;
  const number=Number(value);
  return Number.isFinite(number) && number>=0.01 && number<=10000 ? number : null;
}

export function parseSimulatedQuantity(raw){
  const text=String(raw??"").trim();
  if(!/^\d{1,3}$/.test(text)) return null;
  const count=Number(text);
  return Number.isInteger(count) && count>=1 && count<=100 ? count : null;
}

/**
 * Explicit what-if scenario, NOT a sourced retailer price or confirmed GTIN.
 * Price represents ONE item before discounts, quantity is all the items bought.
 * Manufacturer refunds are paid after purchase, conditional on approval.
 */
export function simulateProductOffer(offer,{unitPrice,quantity=1}={}){
  if(offer?.scope!=="produit") return null;
  const price=parseSimulatedUnitPrice(unitPrice);
  const qty=parseSimulatedQuantity(quantity);
  if(price===null || qty===null) return null;

  const upfront=money(price*qty);
  const minimum=requiredQuantity(offer);
  const refund=offer?.mechanism==="manufacturer_refund";
  const base={
    upfront,quantity:qty,unitPrice:price,minimumQuantity:minimum,
    isRefund:refund,conditional:true
  };
  if(qty<minimum){
    return {...base,status:"quantity",saving:null,netCost:null,
      reason:"Quantité insuffisante : "+minimum+" article(s) minimum."};
  }
  const saving=estimateOfferSaving(price,offer,qty);
  if(!Number.isFinite(saving)){
    const tiers=Array.isArray(offer?.quantityTiers)?offer.quantityTiers:[];
    const reason=tiers.length
      ? "Quantité hors des paliers éligibles à cette offre."
      : "Économie non calculable sans conditions supplémentaires.";
    return {...base,status:"ineligible",saving:null,netCost:null,reason};
  }
  const safeSaving=money(Math.max(0,Math.min(upfront,saving)));
  return {...base,status:"estimated",saving:safeSaving,
    netCost:money(upfront-safeSaving),
    netUnitCost:money((upfront-safeSaving)/qty),
    realizedPercent:upfront>0?Math.round(safeSaving/upfront*10000)/100:0,
    reason:refund
      ? "Remboursement éventuel après achat et acceptation du dossier ; prix payé d'abord."
      : "Montant théorique avant vérification de l'enseigne, des références et des conditions."};
}
