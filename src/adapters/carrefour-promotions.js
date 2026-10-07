export function verifyCarrefourPromotionPage(html,offer,{
  sourceUrl=offer?.sourceUrl || ""
}={}){
  const text=normalizePageText(html);
  const reasons=[];
  if(!text) return {ok:false,reasons:["page vide"]};

  const eans=(offer?.eans || []).map((value)=>String(value).replace(/\D/g,"")).filter(Boolean);
  if(!eans.length){
    reasons.push("EAN exact absent de l'offre");
  }else if(!eans.some((ean)=>String(sourceUrl).includes(ean))){
    reasons.push("EAN absent de l'URL produit Carrefour");
  }

  const rules=offer?.productMatch || {};
  const brands=(rules.brands || []).map(normalizeText).filter(Boolean);
  const required=(rules.all || []).map(normalizeText).filter(Boolean);
  const optional=(rules.any || []).map(normalizeText).filter(Boolean);

  if(brands.length && !brands.some((term)=>contains(text,term))){
    reasons.push("marque absente");
  }
  if(required.some((term)=>!contains(text,term))){
    reasons.push("terme produit obligatoire absent");
  }
  if(optional.length && !optional.some((term)=>contains(text,term))){
    reasons.push("aucun terme produit optionnel retrouvé");
  }

  const percent=Number(offer?.savingPercent);
  if(Number.isFinite(percent)){
    const pattern=numberPattern(percent);
    if(!new RegExp("(?:promo\\s*:?\\s*)?"+pattern+"\\s*%","i").test(text)){
      reasons.push("taux promo absent");
    }
  }

  const promoPrice=Number(offer?.sourcePromoPrice);
  if(Number.isFinite(promoPrice) && !pricePresent(text,promoPrice)){
    reasons.push("prix promo absent");
  }

  const regularPrice=Number(offer?.sourceRegularPrice);
  if(Number.isFinite(regularPrice)){
    if(!pricePresent(text,regularPrice)) reasons.push("prix barré absent");
    if(!/au\s+lieu\s+de/i.test(text)) reasons.push("mention prix barré absente");
  }

  return {
    ok:reasons.length===0,
    reasons,
    evidence:{
      eanInUrl:eans.some((ean)=>String(sourceUrl).includes(ean)),
      brandMatched:!brands.length || brands.some((term)=>contains(text,term)),
      requiredMatched:required.every((term)=>contains(text,term)),
      optionalMatched:!optional.length || optional.some((term)=>contains(text,term)),
      promoPriceMatched:!Number.isFinite(promoPrice) || pricePresent(text,promoPrice),
      regularPriceMatched:!Number.isFinite(regularPrice) || pricePresent(text,regularPrice)
    }
  };
}

export function normalizePageText(html){
  return String(html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&eacute;/gi,"é")
    .replace(/&egrave;/gi,"è")
    .replace(/\s+/g," ")
    .trim();
}

function normalizeText(value){
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9%+,.]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function contains(text,term){
  const haystack=" "+normalizeText(text)+" ";
  const needle=" "+normalizeText(term)+" ";
  return haystack.includes(needle);
}

function pricePresent(text,value){
  const fixed=Number(value).toFixed(2);
  const [whole,decimals]=fixed.split(".");
  const pattern=whole+"\\s*[,.]\\s*"+decimals;
  return new RegExp(pattern).test(text);
}

function numberPattern(value){
  const fixed=String(Number(value));
  const [whole,decimals]=fixed.split(".");
  return decimals ? whole+"[,.]"+decimals : whole+"(?:[,.]0+)?";
}
