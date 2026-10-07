const UI_LINES=[
  /^sélectionner$/i,/^sélectionné$/i,/^j\'augmente$/i,/^ma réduction$/i,
  /^bientôt épuisé$/i,/^€$/,/^\d+(?:[,.]\d+)?\s*€$/i,/^bonus quiz/i
];

export function htmlToTextLines(html){
  return decodeHtml(
    String(html ?? "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
      .replace(/<br\s*\/?>/gi,"\n")
      .replace(/<\/(?:div|li|p|h[1-6]|a|span|button|section|article|strong|small)>/gi,"\n")
      .replace(/<[^>]+>/g," ")
  )
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);
}

export function parseCouponNetworkHtml(html,{verifiedAt=todayIso()}={}){
  const lines=htmlToTextLines(html);
  const offers=[];
  const seen=new Set();

  for(let index=0;index<lines.length;index+=1){
    const amount=parseRefundAmount(lines[index]);
    if(amount===null) continue;

    const window=lines.slice(index+1,index+16);
    const descriptionIndex=window.findIndex((line)=>/^sur l[\'’]achat\b/i.test(line));
    if(descriptionIndex<0) continue;

    const description=window[descriptionIndex];
    const titleCandidates=window.slice(0,descriptionIndex).filter((line)=>isTitleCandidate(line));
    const title=titleCandidates.at(-1);
    if(!title) continue;

    const fingerprint=stableHash(title+"|"+description+"|"+amount.toFixed(2));
    if(seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    offers.push(buildCouponNetworkCandidate({title,description,amount,verifiedAt,fingerprint}));
  }

  return offers;
}

export function buildCouponNetworkCandidate({title,description,amount,verifiedAt=todayIso(),fingerprint}){
  const productMatch=deriveProductMatch(title);
  return {
    providerId:"coupon-network",
    provider:"Coupon Network",
    externalId:"auto-"+slugify(title).slice(0,52)+"-"+(fingerprint || stableHash(title+"|"+description+"|"+amount)),
    title,
    type:"ODR",
    category:"autre",
    stores:["all"],
    savingAmount:roundMoney(amount),
    verifiedAt,
    reviewAfter:addDays(verifiedAt,7),
    sourceUrl:"https://www.couponnetwork.fr/index.rss",
    scope:"produit",
    referenceNames:[title],
    ...(productMatch?{productMatch}:{}),
    mechanism:"manufacturer_refund",
    stackGroup:"manufacturer-refund",
    savingBasis:"base",
    autoStack:false,
    stackingConfidence:"unknown",
    stacking:"activation et conditions Coupon Network à vérifier",
    conditions:description+" Offre détectée automatiquement depuis la page publique Coupon Network ; référence exacte et cumul à vérifier avant achat."
  };
}

export function deriveProductMatch(title){
  const normalized=cleanLine(title);
  if(!normalized) return null;
  const separator=normalized.match(/\s[-–—]\s/);
  let brand="";
  let product="";
  if(separator){
    const pos=separator.index;
    brand=normalized.slice(0,pos).trim();
    product=normalized.slice(pos+separator[0].length).trim();
  }else{
    const words=normalized.split(/\s+/).filter(Boolean);
    if(words.length<2) return null;
    brand=words[0];
    product=words.slice(1).join(" ");
  }

  brand=brand.replace(/[™®©]/g,"").trim();
  if(!brand || brand.length<2) return null;

  const terms=distinctiveTerms(product).slice(0,2);
  if(!terms.length) return {brands:[brand],minScore:55};
  return {brands:[brand],all:terms,minScore:Math.min(75,55+terms.length*10)};
}

export function parseRefundAmount(line){
  const match=cleanLine(line).match(/^(\d+(?:[,.]\d{1,2})?)\s*€\s*rembours/i);
  if(!match) return null;
  const value=Number(match[1].replace(",","."));
  return Number.isFinite(value) && value>0 ? value : null;
}

function isTitleCandidate(line){
  if(!line || /^sur l[\'’]achat/i.test(line)) return false;
  if(parseRefundAmount(line)!==null) return false;
  return !UI_LINES.some((pattern)=>pattern.test(line));
}

function distinctiveTerms(product){
  const stop=new Set(["global","gamme","produit","produits","classique","choix","dans","avec","pour","sans","sur","une","des","les","aux","plus","nature","nouveau","nouveaux"]);
  return product
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[™®©*]/g," ")
    .split(/[^a-zA-Z0-9]+/)
    .map((word)=>word.trim())
    .filter((word)=>word && !stop.has(word.toLocaleLowerCase("fr")))
    .filter((word)=>word.length>=4 || /\d/.test(word))
    .slice(0,4);
}

function slugify(value){
  return String(value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"") || "offre";
}

function cleanLine(value){ return String(value ?? "").replace(/\s+/g," ").trim(); }

function decodeHtml(value){
  return String(value)
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&euro;|&#8364;/gi,"€")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,"\"")
    .replace(/&#39;|&apos;/gi,"\'")
    .replace(/&rsquo;|&#8217;/gi,"’")
    .replace(/&ndash;|&#8211;/gi,"–")
    .replace(/&mdash;|&#8212;/gi,"—")
    .replace(/&agrave;/gi,"à")
    .replace(/&eacute;/gi,"é")
    .replace(/&egrave;/gi,"è")
    .replace(/&ecirc;/gi,"ê")
    .replace(/&ocirc;/gi,"ô")
    .replace(/&ccedil;/gi,"ç")
    .replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code)));
}

function stableHash(value){
  let hash=2166136261;
  for(const char of String(value)){ hash^=char.codePointAt(0); hash=Math.imul(hash,16777619); }
  return (hash>>>0).toString(36);
}

function addDays(iso,days){
  const date=new Date(iso+"T12:00:00Z");
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}

function todayIso(){ return new Date().toISOString().slice(0,10); }
function roundMoney(value){ return Math.round((Number(value)+Number.EPSILON)*100)/100; }
