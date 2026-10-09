import {
  estimateRetailerPromoSaving,
  minimumQuantityForRetailerPromo
} from "./retailer-promo.js";
import {canonicalGtin} from "./gtin.js";

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g," ")
    .trim()
    .replace(/\s+/g," ");
}

export function matchOfferToProduct(product,offer) {
  if(offer.scope!=="produit") return noMatch("not-product-scope");
  const code=canonicalGtin(product?.code);
  const rawCodes=Array.isArray(offer.eans) ? offer.eans : [];
  const exactCodes=new Set(rawCodes.map(canonicalGtin).filter(Boolean));
  if(code && exactCodes.has(code)) {
    return {
      matched:true,
      exact:true,
      confidence:"exact",
      score:100,
      reason:"EAN/GTIN explicitement référencé par l’offre"
    };
  }
  // A promotion backed by explicit GTINs targets those references only.
  // Broad brand keywords must never resurrect a different scanned SKU.
  if(rawCodes.length){
    return noMatch("ean-not-in-offer");
  }

  const rules=offer.productMatch;
  if(!rules) return noMatch("no-product-rules");

  const haystack=normalizeText([
    product?.name,
    product?.brands,
    ...(product?.categories || [])
  ].filter(Boolean).join(" "));

  const required=(rules.all || []).map(normalizeText).filter(Boolean);
  if(required.some((term)=>!containsTerm(haystack,term))) {
    return noMatch("required-term-missing");
  }

  const brands=(rules.brands || []).map(normalizeText).filter(Boolean);
  const brandMatched=brands.length===0 || brands.some((term)=>containsTerm(haystack,term));
  if(!brandMatched) return noMatch("brand-mismatch");

  const optional=(rules.any || []).map(normalizeText).filter(Boolean);
  const optionalMatches=optional.filter((term)=>containsTerm(haystack,term));
  if(optional.length && optionalMatches.length===0) {
    return noMatch("optional-term-missing");
  }

  let score=0;
  if(brands.length) score+=55;
  score+=Math.min(25,required.length*10);
  score+=Math.min(20,optionalMatches.length*10);
  score=Math.min(99,score);

  if(score<(rules.minScore ?? 55)) return noMatch("score-too-low");

  return {
    matched:true,
    exact:false,
    confidence:score>=80?"probable":"candidate",
    score,
    reason:"Correspondance marque/nom ; référence exacte à vérifier"
  };
}

export function findProductOffers(product,offers,{store,channel=null}={}) {
  return offers
    .filter((offer)=>offer.scope==="produit")
    .filter((offer)=>!store || offer.stores?.includes(store) || offer.stores?.includes("all"))
    .filter((offer)=>{
      const channels=Array.isArray(offer.channels) ? offer.channels : [];
      return !channel || channels.length===0 || channels.includes(channel) || channels.includes("all");
    })
    .map((offer)=>({offer,match:matchOfferToProduct(product,offer)}))
    .filter((entry)=>entry.match.matched)
    .sort((a,b)=>{
      if(a.match.exact!==b.match.exact) return a.match.exact ? -1 : 1;
      return b.match.score-a.match.score;
    });
}

export function effectiveOfferPercent(offer,quantity=1) {
  const qty=Math.max(1,Math.trunc(Number(quantity)||1));
  const tiers=Array.isArray(offer.quantityTiers) ? offer.quantityTiers : [];
  const tier=tiers
    .filter((item)=>qty>=item.minQty && (item.maxQty===null || item.maxQty===undefined || qty<=item.maxQty))
    .sort((a,b)=>b.minQty-a.minQty)[0];
  if(tier && Number.isFinite(tier.savingPercent)) return tier.savingPercent;
  return Number.isFinite(offer.savingPercent) ? offer.savingPercent : null;
}

export function estimateOfferSaving(price,offer,quantity=1) {
  const value=Number(price);
  const qty=Math.max(1,Math.trunc(Number(quantity)||1));
  const minPurchaseQty=Math.max(1,Math.trunc(Number(offer.minPurchaseQty)||1));
  if(!Number.isFinite(value) || value<=0 || qty<minPurchaseQty) return null;
  const formulaSaving=estimateRetailerPromoSaving(value,qty,offer);
  if(Number.isFinite(formulaSaving)) return formulaSaving;
  if(offer.promoFormula && !Number.isFinite(formulaSaving)) return null;
  const cap=Number.isFinite(offer.savingCapAmount)
    ? Math.max(0,offer.savingCapAmount) : Infinity;
  if(Number.isFinite(offer.savingAmount)) {
    const multiplier=offer.savingAmountMode==="per-unit" ? qty : 1;
    return Math.min(value*qty,cap,round(offer.savingAmount*multiplier));
  }
  const percent=effectiveOfferPercent(offer,qty);
  if(Number.isFinite(percent)) {
    return Math.min(value*qty,cap,round(value*qty*percent/100));
  }
  return null;
}

function containsTerm(haystack,term) {
  if(!term) return false;
  return (` ${haystack} `).includes(` ${term} `);
}

function noMatch(reason) {
  return {matched:false,exact:false,confidence:"none",score:0,reason};
}

function round(value) {
  return Math.round((Number(value)+Number.EPSILON)*100)/100;
}


export function rankMatchedOffers(matches,{price=null,quantity=1}={}) {
  const qty=Math.max(1,Math.trunc(Number(quantity)||1));
  return (matches || [])
    .map((entry)=>{
      const minQty=requiredQuantity(entry.offer);
      const quantitySatisfied=qty>=minQty;
      const estimatedSaving=Number.isFinite(Number(price))
        ? estimateOfferSaving(Number(price),entry.offer,qty)
        : null;
      const percent=effectiveOfferPercent(entry.offer,qty);
      let priority=entry.match.exact ? 100 : entry.match.confidence==="probable" ? 70 : 50;
      priority+=Math.min(20,Math.max(0,entry.match.score||0)/5);
      if(quantitySatisfied) priority+=8;
      else priority-=8;
      if(Number.isFinite(estimatedSaving)) priority+=Math.min(15,estimatedSaving*3);
      if(Number.isFinite(percent)) priority+=Math.min(10,percent/10);
      return {
        ...entry,
        action:{
          priority:Math.round(priority*10)/10,
          minQty,
          missingQty:Math.max(0,minQty-qty),
          quantitySatisfied,
          estimatedSaving,
          effectivePercent:percent,
          label:entry.match.exact
            ? "Meilleure offre vérifiable"
            : entry.match.confidence==="probable"
              ? "Candidat fort"
              : "Candidat à vérifier"
        }
      };
    })
    .sort((a,b)=>{
      if(a.match.exact!==b.match.exact) return a.match.exact ? -1 : 1;
      if(a.action.quantitySatisfied!==b.action.quantitySatisfied) return a.action.quantitySatisfied ? -1 : 1;
      const aSaving=Number.isFinite(a.action.estimatedSaving) ? a.action.estimatedSaving : -1;
      const bSaving=Number.isFinite(b.action.estimatedSaving) ? b.action.estimatedSaving : -1;
      if(aSaving!==bSaving) return bSaving-aSaving;
      if(a.action.priority!==b.action.priority) return b.action.priority-a.action.priority;
      return (b.match.score||0)-(a.match.score||0);
    });
}

export function requiredQuantity(offer) {
  const explicit=Math.max(1,Math.trunc(Number(offer?.minPurchaseQty)||1));
  const formulaMin=minimumQuantityForRetailerPromo(offer);
  const tiers=Array.isArray(offer?.quantityTiers) ? offer.quantityTiers : [];
  if(!tiers.length) return Math.max(explicit,formulaMin || 1);
  const tierMin=Math.min(...tiers.map((tier)=>Math.max(1,Math.trunc(Number(tier.minQty)||1))));
  return Math.max(explicit,tierMin,formulaMin || 1);
}
