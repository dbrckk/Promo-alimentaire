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
  const code=String(product?.code ?? "").replace(/\D/g,"");
  const exactCodes=(offer.eans || []).map((value)=>String(value).replace(/\D/g,""));
  if(code && exactCodes.includes(code)) {
    return {
      matched:true,
      exact:true,
      confidence:"exact",
      score:100,
      reason:"EAN/GTIN explicitement référencé par l’offre"
    };
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

export function findProductOffers(product,offers,{store}={}) {
  return offers
    .filter((offer)=>offer.scope==="produit")
    .filter((offer)=>!store || offer.stores?.includes(store) || offer.stores?.includes("all"))
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
  if(Number.isFinite(offer.savingAmount)) {
    const multiplier=offer.savingAmountMode==="per-unit" ? qty : 1;
    return Math.min(value*qty,round(offer.savingAmount*multiplier));
  }
  const percent=effectiveOfferPercent(offer,qty);
  if(Number.isFinite(percent)) {
    return Math.min(value*qty,round(value*qty*percent/100));
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
