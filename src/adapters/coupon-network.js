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

export function cleanOfferTitle(title){
  return cleanLine(title)
    .replace(/\s+\d+(?:[,.]\d{1,2})?\s*€\s*rembours(?:é|és|ée|ées)?\s*$/i,"")
    .trim();
}

export function buildCouponNetworkCandidate({title,description,amount,verifiedAt=todayIso(),fingerprint,externalId=null,sourceUrl=null}){
  title=cleanOfferTitle(title);
  const productMatch=deriveProductMatch(title,description);
  return {
    providerId:"coupon-network",
    provider:"Coupon Network",
    externalId:externalId || "auto-"+slugify(title).slice(0,52)+"-"+(fingerprint || stableHash(title+"|"+description+"|"+amount)),
    title,
    type:"ODR",
    category:"autre",
    stores:["all"],
    savingAmount:roundMoney(amount),
    savingAmountMode:"per-offer",
    minPurchaseQty:inferMinPurchaseQty(description),
    verifiedAt,
    reviewAfter:addDays(verifiedAt,7),
    sourceUrl:sourceUrl || "https://www.couponnetwork.fr/index.rss",
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

export function inferMinPurchaseQty(description){
  const text=cleanLine(description)
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("fr");
  const digit=text.match(/\b(?:achat|l'achat|d'achat)\s+(?:de|d')\s*(\d{1,2})\b/i)
    || text.match(/\bsur\s+l['’]?achat\s+de\s+(\d{1,2})\b/i);
  if(digit){
    const value=Number(digit[1]);
    return Number.isFinite(value) && value>=1 ? Math.min(value,99) : 1;
  }
  const words=new Map([["un",1],["une",1],["deux",2],["trois",3],["quatre",4],["cinq",5],["six",6]]);
  const wordMatch=text.match(/\bsur\s+l['’]?achat\s+(?:de|d')\s*(un|une|deux|trois|quatre|cinq|six)\b/i);
  if(wordMatch) return words.get(wordMatch[1]) || 1;
  return 1;
}

export function deriveProductMatch(title,description=""){
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

  let terms=distinctiveTerms(product).slice(0,2);
  if(!terms.length && description){
    const brandWords=new Set(
      brand.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .toLocaleLowerCase("fr").split(/[^a-z0-9]+/).filter(Boolean)
    );
    terms=distinctiveTerms(description)
      .filter((term)=>!brandWords.has(term.toLocaleLowerCase("fr")))
      .slice(0,2);
  }
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
  const stop=new Set([
    "global","gamme","produit","produits","classique","choix","dans","avec","pour","sans",
    "sur","une","des","les","aux","plus","nature","nouveau","nouveaux","achat","article",
    "articles","pack","paquet","paquets","boite","boites","bouteille","bouteilles","format",
    "formats","ensemble","valable","toute","toutes","tout","parmi"
  ]);
  const seen=new Set();
  const result=[];
  for(const word of String(product)
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[™®©*]/g," ")
    .split(/[^a-zA-Z0-9]+/)
    .map((value)=>value.trim())
    .filter(Boolean)){
      const key=word.toLocaleLowerCase("fr");
      if(stop.has(key)) continue;
      const usefulShortCode=/[a-zA-Z]/.test(word) && /\d/.test(word);
      if(word.length<4 && !usefulShortCode) continue;
      if(seen.has(key)) continue;
      seen.add(key);
      result.push(word);
      if(result.length>=4) break;
  }
  return result;
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

export function extractCouponNetworkDetailUrls(html){
  const urlsById=new Map();
  const source=String(html ?? "");
  const regex=/href=["']([^"']*\/[^/"']*cashback-coupons\/[^"']+\/(\d+))["']/gi;
  let match;
  while((match=regex.exec(source))){
    const href=decodeHtml(match[1]).trim();
    const id=match[2];
    if(!href || !id || urlsById.has(id)) continue;
    try{
      const url=new URL(href,"https://www.couponnetwork.fr/");
      if(url.hostname!=="www.couponnetwork.fr") continue;
      urlsById.set(id,url.toString());
    }catch{}
  }
  return [...urlsById.values()];
}

export function parseCouponNetworkDetailHtml(html,sourceUrl,{verifiedAt=todayIso()}={}){
  const raw=String(html ?? "");
  const title=extractDetailTitle(raw);
  const amount=parseDetailAmount(raw);
  const description=extractDetailDescription(raw);
  if(!title || amount===null || !description) return null;
  const id=String(sourceUrl ?? "").match(/\/(\d+)(?:[/?#]|$)/)?.[1] || stableHash(title+"|"+description);
  return buildCouponNetworkCandidate({
    title,description,amount,verifiedAt,
    externalId:"detail-"+id,
    sourceUrl
  });
}

function extractDetailTitle(html){
  const h1=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if(h1){
    const text=cleanLine(decodeHtml(String(h1).replace(/<[^>]+>/g," ")));
    if(text) return text;
  }
  const titleTag=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if(titleTag){
    const text=cleanLine(decodeHtml(String(titleTag).replace(/<[^>]+>/g," ")));
    const match=text.match(/Bons de réduction gratuits\s+(.+?)\s+à sélectionner/i);
    if(match?.[1]) return cleanLine(match[1]);
  }
  return null;
}

function parseDetailAmount(html){
  const text=decodeHtml(String(html).replace(/<[^>]+>/g," "));
  const match=text.match(/(\d+(?:[,.]\d{1,2})?)\s*€\s*rembours/i);
  if(!match) return null;
  const value=Number(match[1].replace(",","."));
  return Number.isFinite(value) && value>0 ? value : null;
}

function extractDetailDescription(html){
  const headings=[...String(html).matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  for(const match of headings){
    const text=cleanLine(decodeHtml(String(match[1]).replace(/<[^>]+>/g," ")));
    if(/^sur l['’]achat\b/i.test(text)) return text;
  }
  const lines=htmlToTextLines(html);
  return lines.find((line)=>/^sur l['’]achat\b/i.test(line)) || null;
}

/**
 * Gate new public snapshots against complete/partial source failures.
 * A temporary outage must never replace a verified snapshot with 0 offers
 * or silently delete most previous offers.
 */
export function assessCouponNetworkSnapshot(offers,{
  previousCount=0,
  minimum=20,
  maximumDropFraction=0.55
}={}){
  if(!Array.isArray(offers)) return {publish:false,reason:"invalid-result",count:0};
  const count=offers.length;
  if(count<minimum) return {publish:false,reason:"too-few-offers",count};
  const ids=offers.map((offer)=>String(offer?.externalId || "").trim());
  if(ids.some((id)=>!id) || new Set(ids).size!==ids.length){
    return {publish:false,reason:"duplicate-or-missing-ids",count};
  }
  if(offers.some((offer)=>
    offer?.autoStack===true || (Array.isArray(offer?.eans) && offer.eans.length>0)
  )){
    return {publish:false,reason:"unexpected-automatic-eligibility",count};
  }
  if(previousCount>=minimum){
    const fraction=(previousCount-count)/previousCount;
    if(fraction>maximumDropFraction){
      return {publish:false,reason:"suspiciously-large-drop",count};
    }
  }
  return {publish:true,reason:"validated-count",count};
}
