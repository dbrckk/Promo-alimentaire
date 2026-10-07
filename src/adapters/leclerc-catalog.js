function textContent(html){
  return String(html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/\s+/g," ")
    .trim();
}

export function verifyLeclercCatalogOffer(html,offer){
  const text=normalize(textContent(html));
  if(!text) return {ok:false,reasons:["page vide"]};

  const reasons=[];
  const rules=offer?.productMatch || {};
  const brands=(rules.brands || []).map(normalize).filter(Boolean);
  const required=(rules.all || []).map(normalize).filter(Boolean);
  const optional=(rules.any || []).map(normalize).filter(Boolean);

  if(brands.length && !brands.some((term)=>contains(text,term))){
    reasons.push("marque absente");
  }
  if(required.some((term)=>!contains(text,term))){
    reasons.push("terme produit obligatoire absent");
  }
  if(optional.length && !optional.some((term)=>contains(text,term))){
    reasons.push("aucun terme produit optionnel retrouvé");
  }

  const formula=offer?.promoFormula;
  if(formula?.type==="buy_x_get_y_free"){
    const token=String(formula.buy)+"+"+String(formula.free);
    if(!containsLoose(text,token) || !/offert/.test(text)){
      reasons.push("mécanique multi-achat absente");
    }
  }else if(formula?.type==="nth_percent"){
    const pct=numberPattern(formula.percent);
    const second="(?:2e|2eme|2 eme|2nd|deuxieme)";
    if(!new RegExp(pct+"\\s*%.*"+second).test(text)
      && !new RegExp(second+".*"+pct+"\\s*%").test(text)){
      reasons.push("remise sur le 2e absente");
    }
  }else if(offer?.mechanism==="retailer_loyalty"){
    const pct=numberPattern(offer.savingPercent);
    if(!/ticket\s+e[.\s]*leclerc/.test(text) || !new RegExp(pct+"\\s*%").test(text)){
      reasons.push("Ticket E.Leclerc/taux absent");
    }
  }else if(Number.isFinite(Number(offer?.savingPercent))){
    const pct=numberPattern(offer.savingPercent);
    if(!new RegExp(pct+"\\s*%").test(text)){
      reasons.push("taux promo absent");
    }
  }

  return {
    ok:reasons.length===0,
    reasons,
    evidence:{
      brandMatched:!brands.length || brands.some((term)=>contains(text,term)),
      requiredMatched:required.every((term)=>contains(text,term)),
      optionalMatched:!optional.length || optional.some((term)=>contains(text,term))
    }
  };
}

function normalize(value){
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9%+,.]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function contains(text,term){
  return (" "+text+" ").includes(" "+term+" ");
}

function containsLoose(text,term){
  return text.replace(/\s+/g,"").includes(String(term).replace(/\s+/g,""));
}

function numberPattern(value){
  const number=Number(value);
  if(!Number.isFinite(number)) return "(?!)";
  const parts=String(number).split(".");
  if(parts.length===1) return parts[0]+"(?:[,.]0+)?";
  return parts[0]+"[,.]"+parts[1];
}
