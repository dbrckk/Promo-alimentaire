const GENERIC_TITLE_WORDS=new Set([
  "a","au","aux","avec","chacun","chaque","coeurs","coeur","assiette","apero","vegetal","vegetale",
  "original","nouveau","nouveaux","nouvelle","nouvelles","decouvrez","gamme","global","produit","produits",
  "mini","muffins","muffin","boissons","boisson","fruits","fruit","plats","plat","cuisines","cuisine",
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
  let savingPercent=quantityTiers.length ? Math.max(...quantityTiers.map((tier)=>tier.savingPercent)) : parseFlatPercent(text);
  if(!Number.isFinite(savingPercent)) return null;

  const referenceNames=parseReferenceNames(raw);
  const stores=parseStores(text);
  const productMatch=deriveShopmiumProductMatch(title,referenceNames);

  return {
    providerId:"shopmium",
    provider:"Shopmium",
    externalId:"auto-"+slugFromUrl(sourceUrl),
    title,
    type:"ODR",
    category:"autre",
    stores,
    savingPercent,
    verifiedAt,
    startsAt:dates.startsAt,
    expiresAt:dates.expiresAt,
    sourceUrl,
    scope:"produit",
    referenceNames,
    quantityTiers,
    minPurchaseQty:quantityTiers.length ? Math.min(...quantityTiers.map((tier)=>tier.minQty)) : 1,
    ...(productMatch?{productMatch}:{}),
    mechanism:"manufacturer_refund",
    stackGroup:"manufacturer-refund",
    savingBasis:"base",
    autoStack:false,
    stackingConfidence:"restricted",
    stacking:/non cumulable avec toute autre promotion/i.test(text)
      ? "non cumulable avec toute autre promotion"
      : "conditions Shopmium à vérifier",
    conditions:buildConditions({text,referenceNames,quantityTiers})
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
  const words=clean(title).replace(/[™®©+*]/g," ").split(/[^a-zA-ZÀ-ÿ0-9]+/).filter(Boolean);
  const candidates=words.filter((word)=>{
    const key=normalizeWord(word);
    return key.length>=3 && !GENERIC_TITLE_WORDS.has(key) && !/^\d+$/.test(key);
  });
  if(!candidates.length) return null;

  let brand=candidates[0];
  if(candidates.length>=2 && /^[A-ZÀ-Ý]/.test(candidates[0]) && /^[A-ZÀ-Ý]/.test(candidates[1])){
    brand=`${candidates[0]} ${candidates[1]}`;
  }

  const optional=[];
  for(const ref of referenceNames){
    for(const token of clean(ref).split(/[^a-zA-ZÀ-ÿ0-9]+/).filter(Boolean)){
      const key=normalizeWord(token);
      if(key.length<4||GENERIC_TITLE_WORDS.has(key)) continue;
      if(normalizeWord(brand).split(" ").includes(key)) continue;
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

function parseFlatPercent(text){
  const match=clean(text).match(/(?:jusqu['’]à\s*)?-?\s*(\d+(?:[,.]\d+)?)\s*%\s*rembours/i);
  if(!match) return null;
  const value=Number(match[1].replace(",","."));
  return Number.isFinite(value)&&value>0&&value<=100 ? value : null;
}

function parseStores(text){
  const normalized=normalizeWord(text);
  if(normalized.includes("toute enseigne vendante")||normalized.includes("toutes enseignes vendantes")) return ["all"];
  const stores=[];
  if(/\bcarrefour\b/i.test(text)) stores.push("carrefour");
  if(/\bleclerc\b|\be\.leclerc\b/i.test(text)) stores.push("leclerc");
  return stores.length ? [...new Set(stores)] : ["all"];
}

function buildConditions({text,referenceNames,quantityTiers}){
  const parts=[];
  if(quantityTiers.length){
    parts.push(quantityTiers.map((tier)=>`${tier.minQty}${tier.maxQty!==tier.minQty?`-${tier.maxQty}`:""} article(s): ${tier.savingPercent}%`).join(" ; "));
  }
  if(referenceNames.length) parts.push(`${referenceNames.length} référence(s) publique(s) détectée(s)`);
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
