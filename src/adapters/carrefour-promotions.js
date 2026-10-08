export function verifyCarrefourPromotionPage(html,offer,{
  sourceUrl=offer?.sourceUrl || ""
}={}){
  const text=normalizePageText(html);
  const reasons=[];
  if(!text) return {ok:false,reasons:["page vide"]};

  const eans=(offer?.eans || []).map((value)=>String(value).replace(/\D/g,"")).filter(Boolean);
  let officialProductPage=false;
  try{
    const target=new URL(sourceUrl);
    const host=target.hostname.toLowerCase();
    officialProductPage=["carrefour.fr","www.carrefour.fr"].includes(host)
      && target.protocol==="https:" && target.pathname.startsWith("/p/")
      && eans.some((ean)=>target.pathname.endsWith("-"+ean));
  }catch{
    officialProductPage=false;
  }
  if(!eans.length){
    reasons.push("EAN exact absent de l'offre");
  }else if(!officialProductPage){
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

  const percent=offer?.savingPercent===null || offer?.savingPercent===undefined
    ? NaN : Number(offer.savingPercent);
  const promoPrice=offer?.sourcePromoPrice===null || offer?.sourcePromoPrice===undefined
    ? NaN : Number(offer.sourcePromoPrice);
  const regularPrice=offer?.sourceRegularPrice===null || offer?.sourceRegularPrice===undefined
    ? NaN : Number(offer.sourceRegularPrice);

  const pair=Number.isFinite(promoPrice) && Number.isFinite(regularPrice)
    ? findPricePair(text,promoPrice,regularPrice) : null;
  const percentPattern=Number.isFinite(percent)
    ? new RegExp("PROMO\\s*:?\\s*"+numberPattern(percent)+"\\s*%","i") : null;
  if(Number.isFinite(promoPrice) && !pricePresent(text,promoPrice)){
    reasons.push("prix promo absent");
  }
  if(Number.isFinite(regularPrice) && !pricePresent(text,regularPrice)){
    reasons.push("prix barré absent");
  }
  if(Number.isFinite(regularPrice) && !/au\s+lieu\s+de/i.test(text)){
    reasons.push("mention prix barré absente");
  }
  // Price, crossed-out price and advertised percentage must belong to the same
  // nearby promotion block, not separate product suggestions on the page.
  if(Number.isFinite(promoPrice) && Number.isFinite(regularPrice) && !pair){
    reasons.push("prix normal/promo non liés");
  }
  if(percentPattern){
    if(!percentPattern.test(text)){
      reasons.push("taux promo absent");
    }else if(pair && !percentPattern.test(text.slice(pair.end,pair.end+460))){
      reasons.push("taux promo non lié à la paire de prix");
    }
  }
  if(Number.isFinite(percent) && Number.isFinite(promoPrice)
    && Number.isFinite(regularPrice) && regularPrice>0){
    const actual=(regularPrice-promoPrice)/regularPrice*100;
    if(promoPrice>=regularPrice || Math.abs(actual-percent)>1){
      reasons.push("taux incohérent avec les prix");
    }
  }

  return {
    ok:reasons.length===0,
    reasons,
    evidence:{
      eanInUrl:officialProductPage,
      brandMatched:!brands.length || brands.some((term)=>contains(text,term)),
      requiredMatched:required.every((term)=>contains(text,term)),
      optionalMatched:!optional.length || optional.some((term)=>contains(text,term)),
      promoPriceMatched:!Number.isFinite(promoPrice) || pricePresent(text,promoPrice),
      regularPriceMatched:!Number.isFinite(regularPrice) || pricePresent(text,regularPrice)
    }
  };
}

function findPricePair(text,promo,regular){
  const pattern=new RegExp(
    pricePattern(promo)+"\\s*€?\\s*au\\s+lieu\\s+de\\s*"+pricePattern(regular)+"\\s*€?",
    "i"
  );
  const match=pattern.exec(text);
  return match ? {start:match.index,end:match.index+match[0].length} : null;
}

function pricePattern(value){
  const [whole,decimals]=Number(value).toFixed(2).split(".");
  return whole+"\\s*[,.]\\s*"+decimals;
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
