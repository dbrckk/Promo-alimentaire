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
