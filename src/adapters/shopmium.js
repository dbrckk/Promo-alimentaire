const GENERIC_TITLE_WORDS=new Set([
  "a","au","aux","avec","chacun","chaque","son","sa","ses","notre","nos","votre","vos","mon","ma","mes",
  "le","la","les","de","du","des","d","un","une","et","ou","en","sur","coeurs","coeur","assiette","apero","vegetal","vegetale",
  "original","pause","gourmande","gourmand","nouveau","nouveaux","nouvelle","nouvelles","decouvrez","gamme","global","produit","produits",
  "mini","muffins","muffin","boissons","boisson","fruits","fruit","plats","plat","cuisines","cuisine",
  "tranches","tranche","vege","yaourt","yaourts","maison","gels","gel","douche","douches","derma","therapie",
  "parfum","linge","smoothies","smoothie","gourmands","gourmand",
  "proteine","protein","plus","american","sandwich","sandwiches","recettes","sans","viande","poisson"
]);

export function extractShopmiumOfferUrls(html){
  const urls=new Set();
  const source=String(html??"");
  const regex=/href=["']([^"']*\/fr\/n\/[^"'?#]+)[^"']*["']/gi;
  let match;
  while((match=regex.exec(source))){
    try{
      const url=new URL(decodeHtml(match[1]),"https://offers.shopmium.com/fr/");
      if(url.hostname!=="offers.shopmium.com") continue;
      if(!url.pathname.startsWith("/fr/n/")) continue;
      url.search=""; url.hash="";
      urls.add(url.toString());
    }catch{}
  }
  return [...urls];
}

export function parseShopmiumDetailHtml(html,sourceUrl,{verifiedAt=todayIso()}={}){
  const raw=String(html??"");
  const text=decodeHtml(raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "));
  const title=extractTitle(raw);
  if(!title) return null;

  const dates=parseValidityDates(text);
  if(!dates) return null;

  const quantityTiers=parsePercentTiers(text);
  const savingPercent=quantityTiers.length
    ? Math.max(...quantityTiers.map((tier)=>tier.savingPercent))
    : parseFlatPercent(text);
  const fixedAmount=Number.isFinite(savingPercent) ? null : parseShopmiumFixedRefund(text);
  if(!Number.isFinite(savingPercent) && !Number.isFinite(fixedAmount)) return null;

  const referenceNames=parseReferenceNames(raw);
  const stores=parseStores(text);
  // Never publish an offer whose retail eligibility excludes both monitored stores.
  if(!stores.length) return null;
  const savingCapAmount=parseShopmiumSavingCap(text);
  const unlockRequirement=parseShopmiumUnlockRequirement(text);
  const productMatch=deriveShopmiumProductMatch(title,referenceNames);

  return {
    providerId:"shopmium",
    provider:"Shopmium",
    externalId:"auto-"+slugFromUrl(sourceUrl),
    title,
    type:"ODR",
    category:"autre",
    stores,
    ...(Number.isFinite(savingPercent)?{savingPercent}:{}),
    ...(Number.isFinite(fixedAmount)?{savingAmount:fixedAmount,savingAmountMode:"per-offer"}:{}),
    ...(savingCapAmount!==null?{savingCapAmount}:{}),
    ...(unlockRequirement?{requiresUnlock:true,unlockConditions:unlockRequirement}:{}),
    verifiedAt,
    startsAt:dates.startsAt,
    expiresAt:dates.expiresAt,
    sourceUrl,
    scope:"produit",
    referenceNames,
    quantityTiers,
    minPurchaseQty:quantityTiers.length
      ? Math.min(...quantityTiers.map((tier)=>tier.minQty))
      : Number.isFinite(fixedAmount)?parseFixedRefundMinQty(text):1,
    ...(productMatch?{productMatch}:{}),
    mechanism:"manufacturer_refund",
    stackGroup:"manufacturer-refund",
    savingBasis:"base",
    autoStack:false,
    stackingConfidence:"restricted",
    stacking:/non cumulable avec toute autre promotion/i.test(text)
      ? "non cumulable avec toute autre promotion"
      : "conditions Shopmium à vérifier",
    conditions:buildConditions({text,referenceNames,quantityTiers,savingCapAmount,unlockRequirement})
  };
}

export function parseValidityDates(text){
  const normalized=clean(text);
  const match=normalized.match(/Valable entre le\s+(\d{2}\/\d{2}\/\d{4})[\s\S]{0,180}?et le\s+(\d{2}\/\d{2}\/\d{4})/i);
  if(!match) return null;
  return {startsAt:frDateToIso(match[1]),expiresAt:frDateToIso(match[2])};
}

export function parsePercentTiers(text){
  const normalized=clean(text);
  const tiers=[];
  const regex=/(\d+)\s*(?:à\s*(\d+)\s*)?articles?\s+achetés?\s*=\s*-\s*(\d+(?:[,.]\d+)?)\s*%/gi;
  let match;
  while((match=regex.exec(normalized))){
    const minQty=Number(match[1]);
    const maxQty=match[2] ? Number(match[2]) : minQty;
    const savingPercent=Number(match[3].replace(",","."));
    if(!Number.isFinite(minQty)||!Number.isFinite(maxQty)||!Number.isFinite(savingPercent)) continue;
    if(minQty<1||maxQty<minQty||savingPercent<=0||savingPercent>100) continue;
    const key=`${minQty}|${maxQty}|${savingPercent}`;
    if(tiers.some((tier)=>`${tier.minQty}|${tier.maxQty}|${tier.savingPercent}`===key)) continue;
    tiers.push({minQty,maxQty,savingPercent});
  }
  return tiers.sort((a,b)=>a.minQty-b.minQty);
}

export function parseReferenceNames(html){
  const lines=htmlToLines(html);
  const start=lines.findIndex((line)=>/^Référence\(s\) éligible\(s\)/i.test(line)||/^Références? éligibles?/i.test(line));
  if(start<0) return [];
  const result=[];
  for(const line of lines.slice(start+1,start+36)){
    if(/^(Remboursement maximum|Offre non cumulable|En savoir plus|Les enseignes|Vous ne pouvez|Renouvelable|Demande de remboursement)/i.test(line)) break;
    const cleaned=line.replace(/^[-•]\s*/,"").replace(/\s*\(\d+(?:[,.]\d+)?€\)\s*$/,"").trim();
    if(!cleaned||/^\d+ références? éligibles?$/i.test(cleaned)) continue;
    if(cleaned.length>160) continue;
    if(!/[a-zA-ZÀ-ÿ]/.test(cleaned)) continue;
    result.push(cleaned);
  }
  return [...new Set(result)].slice(0,30);
}

export function deriveShopmiumProductMatch(title,referenceNames=[]){
  const titleWords=clean(title).replace(/[™®©+*]/g," ").split(/[^a-zA-ZÀ-ÿ0-9]+/).filter(Boolean);
  const titleKeys=new Set(titleWords.map(normalizeWord).filter(Boolean));

  let brand=inferBrandFromReferencePrefix(referenceNames,titleKeys);
  if(!brand){
    const candidates=titleWords.filter((word)=>{
      const key=normalizeWord(word);
      return key.length>=3 && !GENERIC_TITLE_WORDS.has(key) && !/^\d+$/.test(key);
    });
    if(!candidates.length){
      const shortAllCaps=titleWords.length>0 && titleWords.length<=3
        && titleWords.every((word)=>word===word.toLocaleUpperCase("fr"));
      if(shortAllCaps) brand=titleWords.join(" ");
      else return null;
    }else{
      const shortAllCaps=titleWords.length<=3
        && titleWords.every((word)=>word===word.toLocaleUpperCase("fr"));
      if(shortAllCaps) brand=titleWords.join(" ");
      else{
        brand=candidates[0];
        if(candidates.length>=2 && /^[A-ZÀ-Ý]/.test(candidates[0]) && /^[A-ZÀ-Ý]/.test(candidates[1])){
          brand=`${candidates[0]} ${candidates[1]}`;
        }
      }
    }
  }

  const brandKeys=new Set(normalizeWord(brand).split(" ").filter(Boolean));
  const optional=[];
  for(const ref of referenceNames){
    for(const token of clean(ref).split(/[^a-zA-ZÀ-ÿ0-9]+/).filter(Boolean)){
      const key=normalizeWord(token);
      if(key.length<4||GENERIC_TITLE_WORDS.has(key)) continue;
      if(brandKeys.has(key)) continue;
      if(optional.some((value)=>normalizeWord(value)===key)) continue;
      optional.push(token);
      if(optional.length>=5) break;
    }
    if(optional.length>=5) break;
  }

  return {
    brands:[brand],
    ...(optional.length?{any:optional}:{}),
    minScore:optional.length?60:55
  };
}

function inferBrandFromReferencePrefix(referenceNames,titleKeys){
  if(!Array.isArray(referenceNames)||referenceNames.length===0) return null;
  const tokenized=referenceNames
    .map((ref)=>clean(ref).replace(/[™®©+*]/g," ").split(/[^a-zA-ZÀ-ÿ0-9]+/).filter(Boolean))
    .filter((tokens)=>tokens.length);
  if(!tokenized.length) return null;

  const maxPrefix=Math.min(2,...tokenized.map((tokens)=>tokens.length));
  const common=[];
  for(let index=0;index<maxPrefix;index+=1){
    const firstKey=normalizeWord(tokenized[0][index]);
    if(!firstKey) break;
    if(!tokenized.every((tokens)=>normalizeWord(tokens[index])===firstKey)) break;
    if(GENERIC_TITLE_WORDS.has(firstKey)) continue;
    if(!titleKeys.has(firstKey)) continue;
    common.push(tokenized[0][index]);
  }
  if(!common.length) return null;
  return common.join(" ");
}

export function parseFlatPercent(text){
  const normalized=clean(text);
  // Product descriptions often say "100 % bio", "100 % vegan", etc.
  // A percentage is valid only if the purchase refund itself is described.
  const purchaseConditions=normalized.split(/Conditions de l'offre/i)[1]
    ?.split(/En savoir plus|Qu'en disent-ils/i)[0] || normalized;
  const percent=purchaseConditions.match(/(?:jusqu['’]à\s*)?-?\s*(\d+(?:[,.]\d+)?)\s*%\s*rembours/i)
    || purchaseConditions.match(/remboursement\s+de\s*(\d+(?:[,.]\d+)?)\s*%\s*du\s+prix\s+d['’]achat/i);
  if(!percent) return null;
  const value=Number(percent[1].replace(",","."));
  return Number.isFinite(value)&&value>0&&value<=100 ? value : null;
}

export function parseShopmiumFixedRefund(text){
  const normalized=clean(text);
  const conditions=normalized.split(/Conditions de l'offre/i)[1]
    ?.split(/En savoir plus|Qu'en disent-ils/i)[0] || "";
  // Require "remboursement fixe" explicitly; an advertised product price (€)
  // or a 1 € challenge ceiling is NOT a flat cashback amount.
  const match=conditions.match(/remboursement\s+fixe\s+de\s*(\d+(?:[,.]\d{1,2})?)\s*€/i);
  if(!match) return null;
  const value=Number(match[1].replace(",","."));
  return Number.isFinite(value) && value>0 && value<=1000
    ? Math.round(value*100)/100 : null;
}

function parseFixedRefundMinQty(text){
  const conditions=clean(text).split(/Conditions de l'offre/i)[1] || "";
  const hint=conditions.slice(0,400).match(/(?:sur\s+|pour\s+)(\d+)\s+articles?\b/i);
  if(hint) return Math.min(100,Math.max(1,Number(hint[1])));
  return 1;
}

export function parseShopmiumSavingCap(text){
  // This is a *monetary* cap, not the supplier's article-count or quota limit.
  const match=clean(text).match(/(?:dans\s+la\s+limite\s+de|plafonn(?:é|ée?)\s+à)\s*(\d+(?:[,.]\d{1,2})?)\s*€/i);
  if(!match) return null;
  const amount=Number(match[1].replace(",","."));
  return Number.isFinite(amount)&&amount>0 ? Math.round(amount*100)/100 : null;
}

export function parseShopmiumUnlockRequirement(text){
  const normalized=clean(text);
  const condition=normalized.match(/(?:pour\s+d[ée]bloquer\s+cette\s+offre|offre\s+à\s+d[ée]bloquer|r[ée]serv[ée]e?\s+aux\s+gagnants\s+du\s+d[ée]fi)/i);
  if(!condition) return null;
  // No assumption that the user has completed the challenge.
  return "Offre à débloquer dans Shopmium : consulter les conditions et vérifier les demandes préalables.";
}

export function parseStores(text){
  const normalized=clean(text);
  const start=normalized.search(/Valable\s+entre\s+le\s+\d{2}\/\d{2}\/\d{4}/i);
  if(start<0) return [];
  const validity=normalized.slice(start,start+1200)
    .split(/Demande de remboursement possible|R[ée]f[ée]rences?\s+éligibles?|Offre non cumulable/i)[0];
  const storeClause=validity.match(/\bchez\s+(.{1,240}?)\s+UNIQUEMENT\b/i)
    || validity.match(/\bchez\s+(.{1,240}?)(?=,\s+dans\s+la\s+limite|\.\s|$)/i);
  const allStores=/\b(?:dans\s+toute|toutes?)\s+enseigne\s+vendante/i.test(validity);
  let supported;
  if(storeClause){
    supported=[];
    if(/\bCarrefour\b/i.test(storeClause[1])) supported.push("carrefour");
    if(/\b(?:E\.?\s*)?Leclerc\b/i.test(storeClause[1])) supported.push("leclerc");
  }else if(allStores){
    supported=["carrefour","leclerc"];
  }else{
    // A partial or unknown merchant rule is not enough to claim eligibility.
    return [];
  }
  const excludes=[...validity.matchAll(/\b(?:sauf|hors|à\s+l['’]exception\s+de)\s+(.{1,100}?)(?=,\s+dans\s+la\s+limite|\.|$)/gi)]
    .map((item)=>item[1]).join(" ");
  if(/\bCarrefour\b/i.test(excludes)){
    supported=supported.filter((s)=>s!=="carrefour");
  }
  if(/\b(?:E\.?\s*)?Leclerc\b/i.test(excludes)){
    supported=supported.filter((s)=>s!=="leclerc");
  }
  // Retain the existing "all" behavior only when both supported stores are eligible.
  return supported.length===2 ? ["all"] : supported;
}

function buildConditions({text,referenceNames,quantityTiers,savingCapAmount=null,unlockRequirement=null}){
  const parts=[];
  if(quantityTiers.length){
    parts.push(quantityTiers.map((tier)=>`${tier.minQty}${tier.maxQty!==tier.minQty?`-${tier.maxQty}`:""} article(s): ${tier.savingPercent}%`).join(" ; "));
  }
  if(referenceNames.length) parts.push(`${referenceNames.length} référence(s) publique(s) détectée(s)`);
  if(Number.isFinite(savingCapAmount)) parts.push("Remboursement plafonné à "+savingCapAmount.toFixed(2).replace(".",",")+" €.");
  if(unlockRequirement) parts.push(unlockRequirement);
  if(/non cumulable avec toute autre promotion/i.test(text)) parts.push("Non cumulable avec toute autre promotion.");
  parts.push("Offre détectée automatiquement depuis la fiche publique Shopmium ; disponibilité et conditions à revérifier avant achat.");
  return parts.join(" ");
}

function extractTitle(html){
  const titleTag=String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if(titleTag){
    const text=clean(decodeHtml(titleTag).replace(/<[^>]+>/g," "));
    const match=text.match(/^Shopmium\s*\|\s*(.+)$/i);
    if(match?.[1]) return clean(match[1]);
  }
  const h1=String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return h1 ? clean(decodeHtml(h1).replace(/<[^>]+>/g," ")) : null;
}

function htmlToLines(html){
  return decodeHtml(String(html??"")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/(?:div|li|p|h[1-6]|span|strong|small)>/gi,"\n")
    .replace(/<[^>]+>/g," "))
    .split(/\r?\n/).map(clean).filter(Boolean);
}
function frDateToIso(value){ const [d,m,y]=value.split("/"); return `${y}-${m}-${d}`; }
function slugFromUrl(url){ return String(url).match(/\/fr\/n\/([^/?#]+)/)?.[1] || "offer"; }
function normalizeWord(value){ return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim(); }
function clean(value){ return String(value??"").replace(/\s+/g," ").trim(); }
function decodeHtml(value){ return String(value)
  .replace(/&nbsp;|&#160;/gi," ").replace(/&euro;|&#8364;/gi,"€").replace(/&amp;/gi,"&")
  .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&rsquo;|&#8217;/gi,"’")
  .replace(/&ndash;|&#8211;/gi,"–").replace(/&mdash;|&#8212;/gi,"—")
  .replace(/&agrave;/gi,"à").replace(/&eacute;/gi,"é").replace(/&egrave;/gi,"è")
  .replace(/&ecirc;/gi,"ê").replace(/&ocirc;/gi,"ô").replace(/&ccedil;/gi,"ç")
  .replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))); }
function todayIso(){ return new Date().toISOString().slice(0,10); }
