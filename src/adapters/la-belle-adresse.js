const KNOWN_BRANDS=[
  {test:/^Le Chat\b/i,brands:["Le Chat"],label:"Le Chat"},
  {test:/^X\.\s*TRA\b|^XTRA\b/i,brands:["X.TRA","X-tra","Xtra"],label:"X.TRA"},
  {test:/^Mir\b/i,brands:["Mir"],label:"Mir"},
  {test:/^Maison Verte\b/i,brands:["Maison Verte"],label:"Maison Verte"},
  {test:/^Bref\b/i,brands:["Bref","BREF"],label:"Bref"},
  {test:/^Super Croix\b/i,brands:["Super Croix"],label:"Super Croix"},
  {test:/^Minidou\b/i,brands:["Minidou"],label:"Minidou"}
];

const GENERIC_TERMS=new Set([
  "lessive","liquide","caps","capsule","capsules","bloc","blocs","wc","total","express",
  "linge","flacon","recharge","recharges","produit","produits","format","formats"
]);

export function parseLaBelleAdresseHtml(html,{verifiedAt=todayIso(),sourceUrl="https://www.labelleadresse.com/economies/remboursement"}={}){
  const lines=htmlToLines(html);
  const offers=[];
  const seen=new Set();

  for(let index=0;index<lines.length;index+=1){
    const percent=parseRefundPercent(lines[index]);
    if(percent===null) continue;

    const title=findOfferTitle(lines,index);
    if(!title) continue;
    const key=normalize(title);
    if(seen.has(key)) continue;
    seen.add(key);

    offers.push(buildLaBelleAdresseOffer({title,percent,verifiedAt,sourceUrl}));
  }

  return offers;
}

export function buildLaBelleAdresseOffer({title,percent,verifiedAt=todayIso(),sourceUrl="https://www.labelleadresse.com/economies/remboursement"}){
  const productMatch=deriveLaBelleAdresseProductMatch(title);
  return {
    providerId:"belle-adresse",
    provider:"La Belle Adresse",
    externalId:"auto-"+slugify(title),
    title,
    type:"ODR",
    category:"entretien",
    stores:["all"],
    savingPercent:percent,
    verifiedAt,
    reviewAfter:addDays(verifiedAt,7),
    sourceUrl,
    scope:"produit",
    referenceNames:[title],
    ...(productMatch?{productMatch}:{}),
    mechanism:"manufacturer_refund",
    stackGroup:"manufacturer-refund",
    savingBasis:"base",
    autoStack:false,
    stackingConfidence:"restricted",
    stacking:"offre généralement non cumulable avec promotions, lots, réductions magasin ou fidélité",
    conditions:"Offre publique La Belle Adresse détectée automatiquement. Une utilisation par mois ; preuve d'achat à transmettre dans les 30 jours. Référence et disponibilité à revérifier avant achat."
  };
}

export function deriveLaBelleAdresseProductMatch(title){
  const cleanTitle=clean(title);
  const known=KNOWN_BRANDS.find((entry)=>entry.test.test(cleanTitle));
  if(!known) return null;

  let rest=cleanTitle.replace(known.test,"").trim();
  const terms=rest
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .split(/[^a-zA-Z0-9]+/)
    .map((word)=>word.trim())
    .filter(Boolean)
    .filter((word)=>!GENERIC_TERMS.has(word.toLocaleLowerCase("fr")))
    .filter((word)=>word.length>=4 || (/[a-zA-Z]/.test(word)&&/\d/.test(word)))
    .slice(0,3);

  const match={brands:known.brands,minScore:55};
  if(terms.length){
    match.any=terms;
    match.minScore=60;
  }else{
    const usefulGeneric=rest
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .split(/[^a-zA-Z0-9]+/).filter(Boolean)
      .filter((word)=>word.length>=4)
      .slice(0,2);
    if(usefulGeneric.length){
      match.any=usefulGeneric;
      match.minScore=60;
    }
  }
  return match;
}

export function parseRefundPercent(line){
  const match=clean(line).match(/^(\d+(?:[,.]\d+)?)\s*%\s*rembours(?:é|és|ée|ées)?$/i);
  if(!match) return null;
  const value=Number(match[1].replace(",","."));
  return Number.isFinite(value)&&value>0&&value<=100 ? value : null;
}

function findOfferTitle(lines,index){
  for(let offset=1;offset<=6;offset+=1){
    const candidate=lines[index-offset];
    if(!candidate) continue;
    if(isNoise(candidate)) continue;
    if(parseRefundPercent(candidate)!==null) continue;
    if(candidate.length>120) continue;
    return candidate;
  }
  return null;
}

function isNoise(line){
  return /^(image:|sélectionner|pour|remboursement|impression|toutes? les|tous les|me faire rembourser|imprimer mes bons)$/i.test(clean(line))
    || /^\d+(?:[,.]\d+)?\s*€$/i.test(clean(line));
}

function htmlToLines(html){
  return decodeHtml(String(html??"")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/(?:div|li|p|h[1-6]|span|strong|small|button|section|article)>/gi,"\n")
    .replace(/<[^>]+>/g," "))
    .split(/\r?\n/).map(clean).filter(Boolean);
}
function slugify(value){return normalize(value).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80)||"offre";}
function normalize(value){return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g," ").trim();}
function clean(value){return String(value??"").replace(/\s+/g," ").trim();}
function addDays(iso,days){const date=new Date(iso+"T12:00:00Z");date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
function todayIso(){return new Date().toISOString().slice(0,10);}
function decodeHtml(value){return String(value)
  .replace(/&nbsp;|&#160;/gi," ").replace(/&euro;|&#8364;/gi,"€").replace(/&amp;/gi,"&")
  .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&rsquo;|&#8217;/gi,"’")
  .replace(/&ndash;|&#8211;/gi,"–").replace(/&mdash;|&#8212;/gi,"—")
  .replace(/&agrave;/gi,"à").replace(/&eacute;/gi,"é").replace(/&egrave;/gi,"è")
  .replace(/&ecirc;/gi,"ê").replace(/&ocirc;/gi,"ô").replace(/&ccedil;/gi,"ç")
  .replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))); }
