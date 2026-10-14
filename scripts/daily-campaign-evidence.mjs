import {parisCivilDay} from "../src/ingestion.js";

// Deliberately narrow: only prove a known dated campaign from its public
// retailer page. No anonymous checkout price, EAN, percentage of basket,
// new campaign, or expiration extension is manufactured by this verifier.
function norm(value){
  return String(value??"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9%+]+/g," ")
    .replace(/\s+/g," ").trim();
}
function pageText(html){
  const cleaned=String(html??"")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    // Public campaign wording sometimes appears solely as an image alt.
    .replace(/<img\b[^>]*\balt\s*=\s*(["'])(.*?)\1[^>]*>/gi," $2 ")
    .replace(/<[^>]+>/g," ")
    .replace(/&(?:nbsp|amp|quot|eacute|egrave|rsquo|ndash|minus);/gi,(item)=>{
      const entities={"&nbsp;":" ","&amp;":"&","&quot;":'"',
        "&eacute;":"é","&egrave;":"è","&rsquo;":"'","&ndash;":"-","&minus;":"-"};
      return entities[item.toLowerCase()]??" ";
    })
    .replace(/&#(\d+);/g,(_,value)=>String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi,(_,value)=>String.fromCodePoint(parseInt(value,16)));
  return norm(cleaned);
}
function allowedSource(campaign){
  const url=campaign?.sourceUrl;
  if(typeof url!=="string") return false;
  try{
    const parsed=new URL(url);
    if(parsed.protocol!=="https:" || parsed.username || parsed.password
      || parsed.search || parsed.hash) return false;
    if(campaign.store==="carrefour")
      return parsed.href==="https://www.carrefour.fr/offres-du-moment";
    if(campaign.store==="leclerc")
      return parsed.hostname==="nos-catalogues-promos-v2.e.leclerc"
        && /^\/catalog\/[a-z0-9-]+\/[a-z0-9-]+\/?$/i.test(parsed.pathname);
  }catch{}
  return false;
}
const patterns={
  "carrefour-bio-2eme-20261019":{
    title:"bio bien plus",before:"60% sur le 2",after:"jusqu au 19 octobre 2026"
  },
  "carrefour-courses-en-ligne-20261108":{
    title:"le mois online",before:"50% sur le 2",after:"jusqu au 8 novembre 2026"
  },
  "carrefour-promos-semaine-20261012":{
    title:"nos promos de la semaine",before:"2+1 offert",after:"jusqu au 12 octobre 2026"
  },
  "carrefour-bons-plans-famille-20261016":{
    title:"bons plans famille",before:"50% sur le 2",
    after:"jusqu au vendredi 16 octobre 2026",expires:"2026-10-16"
  },
  "carrefour-semaine-second-20261019":{
    title:"nos promos de la semaine",before:"50% sur le 2",
    after:"jusqu au 19 octobre 2026",expires:"2026-10-19"
  },
  "carrefour-raisin-red-globe-20261015":{
    title:"raisin red globe",before:"le bon plan du moment",
    after:"jusqu au 15 octobre 2026",expires:"2026-10-15"
  },
  "carrefour-semaine-gout-20261026":{
    title:"semaine du gout",before:"30% sur le 2",
    after:"jusqu au 26 octobre 2026",expires:"2026-10-26"
  },
  "leclerc-quotidien-20261017":{
    title:"catalogue nos promos du moment",
    before:"votre catalogue digital",after:"du 06 10 2026 au 17 10 2026"
  }
};
function validDay(date){
  if(typeof date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d=new Date(date+"T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===date;
}
export function confirmPublicDailyCampaign(html,campaign,now=new Date()){
  const today=parisCivilDay(now);
  if(!today || !campaign || !allowedSource(campaign)
    || !validDay(campaign.expiresAt) || !validDay(campaign.verifiedAt)
    || campaign.expiresAt<today || campaign.verifiedAt>today
    || (campaign.startsAt && (!validDay(campaign.startsAt)
      || campaign.startsAt>today))) return false;
  const rule=patterns[campaign.id];
  if(!rule || (rule.expires && campaign.expiresAt!==rule.expires)) return false;
  // The campaign id pins the expiration window; a generic page still
  // advertising the same category cannot silently extend an old selection.
  if(campaign.id==="carrefour-bio-2eme-20261019"
    && campaign.expiresAt!=="2026-10-19") return false;
  if(campaign.id==="carrefour-courses-en-ligne-20261108"
    && campaign.expiresAt!=="2026-11-08") return false;
  if(campaign.id==="carrefour-promos-semaine-20261012"
    && campaign.expiresAt!=="2026-10-12") return false;
  if(campaign.id==="leclerc-quotidien-20261017"
    && campaign.expiresAt!=="2026-10-17") return false;
  const text=pageText(html);
  if(text.length<70 || /access denied|captcha|connexion obligatoire/.test(text))
    return false;
  const title=norm(rule.title),before=norm(rule.before),after=norm(rule.after);
  let index=0;
  while((index=text.indexOf(title,index))!==-1){
    // Keep proof in one local editorial section, not scattered claims from
    // unrelated banners further down the same marketing page.
    const left=text.slice(Math.max(0,index-220),index);
    const right=text.slice(index+title.length,index+title.length+200);
    if(left.includes(before) && right.includes(after)) return true;
    index+=title.length;
  }
  return false;
}


// Short-lived discovery candidates are sourced ONLY from the exact public
// Carrefour campaign page fetched in the daily action. These deliberately
// avoid prices per product, SKU/EAN, guaranteed basket savings or stacking.
// All candidates expire at the end of the observed French civil day unless
// re-discovered on a subsequent public visit.
const CARREFOUR_PUBLIC_URL="https://www.carrefour.fr/offres-du-moment";

function hasLocalCampaignProof(text,{heading,precededBy,followedBy}){
  const needle=norm(heading),prefix=norm(precededBy),suffix=norm(followedBy);
  let index=0;
  while((index=text.indexOf(needle,index))!==-1){
    const left=text.slice(Math.max(0,index-230),index);
    const right=text.slice(index+needle.length,index+needle.length+260);
    if(left.includes(prefix) && right.includes(suffix)) return true;
    index+=needle.length;
  }
  return false;
}

export function discoverCarrefourDailyLeads(html,now=new Date()){
  const today=parisCivilDay(now);
  if(!validDay(today)) return [];
  const text=pageText(html);
  if(text.length<150 || /access denied|captcha|connexion obligatoire/.test(text))
    return [];
  const make=(key,title,claim,category="alimentaire",channels=["store","drive"],
    extra={})=>({
    id:"carrefour-public-lead-"+key+"-"+today.replace(/-/g,""),
    store:"carrefour",channels,category,title,claim,
    startsAt:today,expiresAt:today,verifiedAt:today,
    sourceUrl:CARREFOUR_PUBLIC_URL,...extra
  });
  const found=[];
  if(hasLocalCampaignProof(text,{
    heading:"Fruits et légumes à 0,99€",
    precededBy:"Fruits et légumes à moins de 1 euro",
    followedBy:"En Hypermarché et en Drive"
  })) found.push(make("legumes-099",
    "Sélection fruits et légumes : annonce à 0,99 €",
    "L'enseigne affiche une sélection à 0,99 €. Produit, quantité, unité et prix dans le magasin choisi à contrôler avant achat.",
    "fruits et légumes"));
  if(hasLocalCampaignProof(text,{
    heading:"Les produits du quotidien à moins de 1€",
    precededBy:"Produits du quotidien à moins de 1 euro",
    followedBy:"En Hypermarché et en Drive"
  })) found.push(make("quotidien-1",
    "Produits du quotidien : sélection annoncée à moins de 1 €",
    "Des produits du quotidien sont annoncés sous le seuil de 1 €. Le produit exact, sa quantité et son prix local doivent être consultés dans le magasin choisi.",
    "épicerie"));
  if(hasLocalCampaignProof(text,{
    heading:"Recettes à petits prix",
    precededBy:"Recettes à petits prix",
    followedBy:"En Hypermarché et en Drive"
  })) found.push(make("recettes-budget",
    "Recettes à petits prix : idées à consulter",
    "Carrefour publie une sélection de recettes économiques. Aucun prix final, nombre de portions ou remise précise n'est vérifié.",
    "alimentaire"));
  if(hasLocalCampaignProof(text,{
    heading:"Le Bio à moins de 2€",
    precededBy:"Bio à moins de 2 euros",
    followedBy:"En Hypermarché et en Drive"
  })) found.push(make("bio-2",
    "Produits Bio annoncés à moins de 2 €",
    "Sélection Bio Carrefour à petit prix ; sans référence exacte, le montant et la quantité du produit ne sont pas confirmés.",
    "bio"));
  if(hasLocalCampaignProof(text,{
    heading:"34% d'économies dès 15€ d'achat sur une sélection du rayon poissonnerie (hors promotion)",
    precededBy:"34% d'économies Club dès 15€ d'achat sur la poissonnerie Exclu Drive",
    followedBy:"Aujourd'hui uniquement Exclusivement dans les Drive participants"
  })) found.push(make("poissonnerie-club-15",
    "Poissonnerie : 34 % d'économies Club dès 15 €",
    "Avantage Club annoncé dès 15 € sur une sélection hors promotions, uniquement aujourd'hui dans les Drives participants. Conditions fidélité et panier éligible à confirmer.",
    "alimentaire",["drive"],{minimumPurchase:15}));
  return found;
}


/**
 * Retain verified, day-only editorial discoveries for their original day
 * even if the next background HTTP request is denied (e.g. Carrefour 403).
 * This does not prolong the offer: the client rejects it after local midnight.
 * Retain at most seven expired days for traceability.
 */
export function retainRecentDailyLeads(entries,today){
  if(!Array.isArray(entries) || !validDay(today)) return [];
  const threshold=new Date(today+"T12:00:00Z");
  threshold.setUTCDate(threshold.getUTCDate()-7);
  const oldest=threshold.toISOString().slice(0,10);
  return entries.filter((entry)=>{
    if(!String(entry?.id||"").startsWith("carrefour-public-lead-"))
      return true;
    return validDay(entry?.expiresAt) && validDay(entry?.verifiedAt)
      && entry.verifiedAt===entry.expiresAt
      && entry.expiresAt>=oldest && entry.expiresAt<=today;
  });
}

// Look for an actually current food brochure on Carrefour's public catalogue
// index. This is an editorial link, not proof that any advertised product or
// price is available in a particular store. The start/end range must appear
// immediately after the named food brochure; catalogues for electronics,
// beauty, pet supplies or dated campaigns are never imported.
//
// Date-only daily lead: even a brochure lasting two weeks is rechecked each
// day; a failed fetch cannot prolong its verification.
const FOOD_BROCHURES=[
  {needle:"au coeur du gout",slug:"au-coeur-du-gout",
    label:"Au cœur du goût"},
  {needle:"le mois monopoly produits laitiers",slug:"produits-laitiers",
    label:"Produits laitiers"},
  {needle:"saveurs de saison",slug:"saveurs-de-saison",
    label:"Saveurs de saison"}
];
const FRENCH_MONTHS={
  janv:1,janvier:1,fev:2,fevr:2,fevrier:2,mars:3,avr:4,avril:4,
  mai:5,juin:6,juil:7,juillet:7,aout:8,sept:9,septembre:9,
  oct:10,octobre:10,nov:11,novembre:11,dec:12,decembre:12
};
function frenchCatalogDay(day,month,year){
  const value=FRENCH_MONTHS[month];
  if(!value) return null;
  const stamp=String(year)+"-"+String(value).padStart(2,"0")+"-"+
    String(Number(day)).padStart(2,"0");
  return validDay(stamp)?stamp:null;
}
export function discoverCarrefourFoodBrochures(html,now=new Date()){
  const today=parisCivilDay(now);
  if(!validDay(today)) return [];
  const text=pageText(html);
  // Catalogue INDEX only. Bounded text windows forbid borrowing a date from
  // another flyer; pages with challenge/denied content are ignored.
  if(text.length<100 || /access denied|captcha|connexion obligatoire/.test(text)
    || !text.includes("catalogues du moment")) return [];
  const currentSection=text.slice(text.indexOf("catalogues du moment")+20)
    .split(/catalogues bientot disponibles|magazines/)[0].slice(0,6000);
  const results=[];
  for(const brochure of FOOD_BROCHURES){
    const pos=currentSection.indexOf(brochure.needle);
    if(pos<0) continue;
    // Match immediately following date, with no unrelated brochure between.
    const tail=currentSection.slice(pos+brochure.needle.length,
      pos+brochure.needle.length+100);
    const range=/^\s*du\s+(\d{1,2})\s+(\w+)\s+au\s+(\d{1,2})\s+(\w+)\s+(20\d{2})\b/.exec(tail);
    if(!range) continue;
    const start=frenchCatalogDay(range[1],range[2],range[5]);
    const end=frenchCatalogDay(range[3],range[4],range[5]);
    if(!start || !end || end<start || today<start || today>end) continue;
    results.push({
      id:"carrefour-public-lead-brochure-"+brochure.slug+"-"+
        today.replace(/-/g,""),
      store:"carrefour",channels:["store"],category:"alimentaire",
      title:"Catalogue Carrefour « "+brochure.label+" »",
      claim:"Prospectus alimentaire officiel annoncé du "+start+
        " au "+end+". Consulter le catalogue et sélectionner son magasin ; aucun prix produit ou pourcentage d'économie n'est confirmé ici.",
      startsAt:today,expiresAt:today,verifiedAt:today,
      sourceUrl:"https://www.carrefour.fr/catalogue/carrefour"
    });
  }
  return results;
}
