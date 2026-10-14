import {readFile,writeFile} from "node:fs/promises";
import {confirmPublicDailyCampaign,discoverCarrefourDailyLeads} from "./daily-campaign-evidence.mjs";
import {parisCivilDay} from "../src/ingestion.js";

const destination=new URL("../data/daily-campaigns.json",import.meta.url);
const write=process.argv.includes("--write");
const now=new Date();
const today=parisCivilDay(now);
const payload=JSON.parse(await readFile(destination,"utf8"));
if(!Array.isArray(payload.campaigns)) throw Error("Campagnes publiques invalides");
const sources=[...new Set(payload.campaigns
  .filter((c)=>typeof c?.sourceUrl==="string" && c.expiresAt>=today)
  .map((c)=>c.sourceUrl))];
const pages=new Map();
for(const url of sources){
  try{
    const parsed=new URL(url);
    const ok=parsed.protocol==="https:" && !parsed.search && !parsed.hash
      && !parsed.username && !parsed.password
      && (parsed.href==="https://www.carrefour.fr/offres-du-moment"
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
  }catch(error){
    console.warn("[daily] page indisponible : "+url+" · "+
      String(error?.message||error).slice(0,180));
  }
}
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
const discovered=officialPage
  ?discoverCarrefourDailyLeads(officialPage,now) : [];
const cutoff=new Date(today+"T12:00:00Z");
cutoff.setUTCDate(cutoff.getUTCDate()-7);
const oldest=cutoff.toISOString().slice(0,10);
const historical=next.filter((entry)=>!String(entry.id).startsWith(
  "carrefour-public-lead-"
) || (entry.expiresAt>=oldest && entry.expiresAt<today));
const newlyAdded=discovered.filter((entry)=>!historical.some((old)=>old.id===entry.id));
const updated=[...historical,...newlyAdded];
const discoveryChanged=JSON.stringify(updated)!==JSON.stringify(payload.campaigns);
console.log("[daily] annonces petit budget/jour vérifiées sur la page publique : "+
  discovered.length+" ; entrées nouvelles : "+newlyAdded.length);

console.log("[daily] campagnes reconfirmées "+confirmed+"/"+payload.campaigns.length+
  " ; pages accessibles "+pages.size+"/"+sources.length+
  " ; dates réellement mises à jour "+changed);
if(confirmed===0 && discovered.length===0)
  console.log("::warning title=Catalogue du jour non reconfirmé::" +
    "Aucune preuve officielle récente ; conserver les anciennes dates et laisser la PWA les expirer.");
if(write && (changed || discoveryChanged)){
  payload.campaigns=updated;
  payload.checkedAt=now.toISOString();
  await writeFile(destination,JSON.stringify(payload,null,2)+"\n","utf8");
}
