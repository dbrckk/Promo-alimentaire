import { readFile,writeFile } from "node:fs/promises";
import { verifyCarrefourPromotionPage } from "../src/adapters/carrefour-promotions.js";
import {isOfferActive} from "../src/ingestion.js";
import {writeSourceSyncStatus} from "./source-sync-status.mjs";

const SNAPSHOT_URL=new URL("../data/import/carrefour-promotions-auto.json",import.meta.url);
const write=process.argv.includes("--write");
const today=new Date().toISOString().slice(0,10);
const nextReview=addDays(today,2);

const offers=JSON.parse(await readFile(SNAPSHOT_URL,"utf8"));
if(!Array.isArray(offers)) throw new Error("Snapshot Carrefour invalide.");

let confirmed=0;
let changed=0;
let unavailable=0;
let skippedExpired=0;
let skippedAccessDenied=0;
let accessDenied=false;
const current=new Date();
const eligibleCount=offers.filter((offer)=>isOfferActive(offer,current)).length;
const next=[];

for(const offer of offers){
  // Old campaigns must not be reconfirmed or repeatedly queried after their
  // review deadline; keep them unchanged so the archive remains auditable.
  if(!isOfferActive(offer,current)){
    skippedExpired++;
    next.push(offer);
    continue;
  }
  // HTTP 403 is an explicit access denial, not a transient timeout. Stop
  // requesting further Carrefour pages rather than hammering the same host.
  if(accessDenied){
    skippedAccessDenied++;
    next.push(offer);
    continue;
  }
  try{
    const response=await fetch(offer.sourceUrl,{
      headers:{
        Accept:"text/html,application/xhtml+xml",
        "User-Agent":"PromoAlimentaire/0.1 public-carrefour-promo-verifier"
      },
      redirect:"follow",
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) throw new Error("HTTP "+response.status);
    const html=await response.text();
    if(html.length<1000) throw new Error("réponse anormalement courte");

    const result=verifyCarrefourPromotionPage(html,offer,{
      sourceUrl:response.url || offer.sourceUrl
    });
    if(!result.ok){
      console.warn(
        "[carrefour] non confirmée · "+offer.title+" · "+result.reasons.join(" | ")
      );
      next.push(offer);
      continue;
    }

    confirmed+=1;
    const refreshed={
      ...offer,
      verifiedAt:today,
      reviewAfter:nextReview
    };
    if(
      refreshed.verifiedAt!==offer.verifiedAt
      || refreshed.reviewAfter!==offer.reviewAfter
    ) changed+=1;
    next.push(refreshed);
    console.log("[carrefour] confirmée · "+offer.title);
  }catch(error){
    unavailable+=1;
    if(/HTTP (?:401|403)\b/.test(error.message)) accessDenied=true;
    console.warn("[carrefour] indisponible · "+offer.title+" · "+error.message);
    next.push(offer);
  }
}

console.log(
  "[carrefour] confirmées="+confirmed+
  "/"+offers.length+
  " · indisponibles="+unavailable+
  " · expirées ignorées="+skippedExpired+
  " · accès refusé (requêtes évitées)="+skippedAccessDenied+
  " · mises à jour="+changed
);

if(write && changed>0){
  await writeFile(SNAPSHOT_URL,JSON.stringify(next,null,2)+"\n","utf8");
  console.log("[carrefour] snapshot rafraîchi.");
}
await writeSourceSyncStatus("carrefour",{
  status:eligibleCount>0 && confirmed===eligibleCount?"updated"
    : confirmed===0?"unavailable":"partial",
  reason:eligibleCount===0
    ? "Aucune promotion Carrefour à revalider : "+skippedExpired+" ancienne(s) fiche(s) expirée(s). Découvrir de nouvelles offres nécessite une source publique accessible."
    : accessDenied
      ? "HTTP 401/403 : accès public aux fiches Carrefour refusé ; arrêt des requêtes suivantes sans contournement ("+skippedAccessDenied+" évitées)."
      : confirmed===eligibleCount
        ? "Toutes les campagnes encore valides ont conservé leurs preuves EAN et tarifaires."
        : confirmed===0
          ? "Aucune promotion complète reconfirmée sur "+eligibleCount+" fiche(s) encore dans leur période."
          : "Seulement "+confirmed+"/"+eligibleCount+" promotions non expirées ont été reconfirmées.",
  extractedCount:confirmed,
  previousSnapshotCount:offers.length
},{write});

function addDays(iso,days){
  const date=new Date(iso+"T12:00:00Z");
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
