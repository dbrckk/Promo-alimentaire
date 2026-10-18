import {readFile,writeFile} from "node:fs/promises";
import {confirmPublicDailyCampaign,discoverCarrefourDailyLeads,discoverCarrefourFoodBrochures,retainRecentDailyLeads,dailyCampaignSourceUrls} from "./daily-campaign-evidence.mjs";
import {parisCivilDay} from "../src/ingestion.js";
import {BONIAL_CARREFOUR_URL,BONIAL_LECLERC_URL,
  discoverBonialCarrefourCatalogues,discoverBonialLeclercCatalogues
} from "./bonial-public-catalogues.mjs";

const destination=new URL("../data/daily-campaigns.json",import.meta.url);
const write=process.argv.includes("--write");
const now=new Date();
const today=parisCivilDay(now);
const payload=JSON.parse(await readFile(destination,"utf8"));
if(!Array.isArray(payload.campaigns)) throw Error("Campagnes publiques invalides");
const FOOD_BROCHURE_INDEX="https://www.carrefour.fr/catalogue/carrefour";
// The two official Carrefour entrypoints are permanent even after all
// archived campaigns expire, otherwise future food promotions disappear.
const sources=dailyCampaignSourceUrls(payload.campaigns,today);
const pages=new Map();
const sourceChecks={};
for(const url of sources){
  try{
    const parsed=new URL(url);
    const ok=parsed.protocol==="https:" && !parsed.search && !parsed.hash
      && !parsed.username && !parsed.password
      && (parsed.href==="https://www.carrefour.fr/offres-du-moment"
        || parsed.href===FOOD_BROCHURE_INDEX
        || parsed.hostname==="nos-catalogues-promos-v2.e.leclerc"
          && /^\/catalog\/[a-z0-9-]+\/[a-z0-9-]+\/?$/i.test(parsed.pathname));
    if(!ok){
      console.warn("[daily] URL hors source officielle autorisée : "+url);
      continue;
    }
    const response=await fetch(url,{headers:{
      Accept:"text/html,application/xhtml+xml",
      "User-Agent":"PromoAlimentaire/0.1 public-daily-campaign-verifier"
    },redirect:"error",signal:AbortSignal.timeout(14000)});
    if([401,403,429].includes(response.status))
      throw Error("HTTP "+response.status+" : accès public refusé, pas de contournement");
    if(!response.ok) throw Error("HTTP "+response.status);
    const html=await response.text();
    if(html.length<200) throw Error("contenu public trop court");
    pages.set(url,html);
    sourceChecks[url]={status:"available"};
  }catch(error){
    const reason=String(error?.message||error);
    sourceChecks[url]={status:"unavailable",
      reason:/HTTP (401|403|429)\b/.test(reason)
        ? "HTTP "+reason.match(/HTTP (401|403|429)\b/)[1]
        : "Source indisponible"};
    console.warn("[daily] page indisponible : "+url+" · "+
      reason.slice(0,180));
  }
}
// A public third-party index never proves a barcode, price or actual saving.
// Each retailer is fetched independently: outages cannot refresh stale proof
// from the other chain or hide still-valid evidence.
let alternatives=Array.isArray(payload.alternativeCatalogues)
  ?payload.alternativeCatalogues:[];
let alternativeCheckedAt=payload.alternativeCheckedAt || null;
const alternativeSourceChecks={};
const alternativeSummaries=[];
let successfulAlternatives=0;
for(const entry of [
  {store:"carrefour",name:"Carrefour",url:BONIAL_CARREFOUR_URL,
    discover:discoverBonialCarrefourCatalogues},
  {store:"leclerc",name:"E.Leclerc",url:BONIAL_LECLERC_URL,
    discover:discoverBonialLeclercCatalogues}
]){
  try{
    const response=await fetch(entry.url,{
      headers:{Accept:"text/html,application/xhtml+xml",
        "User-Agent":"PromoAlimentaire/0.1 public-catalogue-index"},
      redirect:"error",signal:AbortSignal.timeout(14000)
    });
    if(!response.ok) throw Error("HTTP "+response.status);
    const html=await response.text();
    const current=entry.discover(html,now);
    if(!current.length){
      const sample=[...html.matchAll(/Catalogue (?:Carrefour|E\.Leclerc|Leclerc)[^<>"'\n]{0,140}/gi)]
        .slice(0,3).map((item)=>item[0]);
      console.warn("[daily] Bonial "+entry.name+" : aucun prospectus actuel exploitable ; "+
        "HTML="+html.length+" ; exemples="+JSON.stringify(sample));
      throw Error("Aucun prospectus actuel avec dates vérifiables");
    }
    alternatives=alternatives.filter((item)=>item?.store!==entry.store)
      .concat(current);
    successfulAlternatives++;
    alternativeCheckedAt=now.toISOString();
    alternativeSourceChecks[entry.store]={status:"available",count:current.length};
    alternativeSummaries.push(entry.name+" : "+current.length+" daté(s)");
    console.log("[daily] Bonial "+entry.name+" : "+current.length+
      " prospectus courant(s) daté(s), sans prix confirmés.");
  }catch(error){
    // Old entries expire independently by verifiedAt and expiry in the PWA.
    const reason=String(error?.message||error).slice(0,130);
    alternativeSourceChecks[entry.store]={status:"unavailable",reason};
    alternativeSummaries.push(entry.name+" : indisponible ("+reason+")");
    console.warn("[daily] Bonial "+entry.name+" indisponible : "+reason);
  }
}
alternatives=alternatives.slice(0,32);
const alternativeStatus=successfulAlternatives===2?"available"
  :successfulAlternatives===1?"partial":"unavailable";
const alternativeReason=alternativeSummaries.join(" ; ");
const alternativeChanged=JSON.stringify(alternatives)
  !==JSON.stringify(payload.alternativeCatalogues||[])
  || payload.alternativeStatus!==alternativeStatus
  || payload.alternativeReason!==alternativeReason
  || JSON.stringify(payload.alternativeSourceChecks||{})
    !==JSON.stringify(alternativeSourceChecks);
const priorAlternativeAttempt=payload.alternativeLastAttemptAt
  && Number.isFinite(Date.parse(payload.alternativeLastAttemptAt))
  ?parisCivilDay(new Date(payload.alternativeLastAttemptAt)):null;

let confirmed=0;
let changed=0;
const next=payload.campaigns.map((entry)=>{
  // Each public page can confirm only its own campaign's title, benefit
  // mechanism and original expiration. No successful HTTP response alone
  // refreshes a campaign; no retailer source can change its endpoint date.
  const html=pages.get(entry.sourceUrl);
  if(!html || !confirmPublicDailyCampaign(html,entry,now)) return entry;
  confirmed++;
  if(entry.verifiedAt===today) return entry;
  changed++;
  return {...entry,verifiedAt:today};
});
// Revisit the same public source once for tightly scoped, source-only
// discovery leads. Each observed lead is dated TODAY and must not create a
// shelf price or automatically eligible loyalty refund.
const officialPage=pages.get("https://www.carrefour.fr/offres-du-moment");
const discovered=[
  ...(officialPage?discoverCarrefourDailyLeads(officialPage,now):[]),
  ...(pages.has(FOOD_BROCHURE_INDEX)
    ?discoverCarrefourFoodBrochures(pages.get(FOOD_BROCHURE_INDEX),now):[])
];
// Keep today's original observation during 403 outages; the PWA applies
// the original expiry at local French midnight regardless of re-fetch status.
const historical=retainRecentDailyLeads(next,today);
const newlyAdded=discovered.filter((entry)=>!historical.some((old)=>old.id===entry.id));
const updated=[...historical,...newlyAdded];
const discoveryChanged=JSON.stringify(updated)!==JSON.stringify(payload.campaigns);
console.log("[daily] annonces et brochures alimentaires du jour, sources publiques : "+
  discovered.length+" ; entrées nouvelles : "+newlyAdded.length);

console.log("[daily] campagnes reconfirmées "+confirmed+"/"+payload.campaigns.length+
  " ; pages accessibles "+pages.size+"/"+sources.length+
  " ; dates réellement mises à jour "+changed);
if(confirmed===0 && discovered.length===0)
  console.log("::warning title=Catalogue du jour non reconfirmé::" +
    "Aucune preuve officielle récente ; conserver les anciennes dates et laisser la PWA les expirer.");
// The last ATTEMPT must be visible even when the public merchant refuses
// access. Do not refresh checkedAt merely because expired leads were pruned:
// no new source evidence was obtained in that situation.
const priorAttemptDay=payload.lastAttemptAt
  && Number.isFinite(Date.parse(payload.lastAttemptAt))
  ?parisCivilDay(new Date(payload.lastAttemptAt)):null;
const statusChanged=JSON.stringify(payload.sourceChecks||{})!==JSON.stringify(sourceChecks);
const provenToday=confirmed>0 || discovered.length>0;
if(write && (changed || discoveryChanged || statusChanged || priorAttemptDay!==today
  || alternativeChanged || priorAlternativeAttempt!==today)){
  payload.campaigns=updated;
  if(provenToday) payload.checkedAt=now.toISOString();
  payload.lastAttemptAt=now.toISOString();
  payload.sourceChecks=sourceChecks;
  payload.alternativeCatalogues=alternatives;
  payload.alternativeCheckedAt=alternativeCheckedAt;
  payload.alternativeLastAttemptAt=now.toISOString();
  payload.alternativeStatus=alternativeStatus;
  payload.alternativeReason=alternativeReason;
  payload.alternativeSourceChecks=alternativeSourceChecks;
  await writeFile(destination,JSON.stringify(payload,null,2)+"\n","utf8");
  console.log("[daily] Dernière tentative enregistrée ; preuve "+
    (provenToday?"mise à jour":"inchangée, campagnes non prolongées")+".");
}
