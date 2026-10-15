import { readFile,writeFile } from "node:fs/promises";
import {verifyCarrefourPromotionPage,isAllowedCarrefourProductUrl} from "../src/adapters/carrefour-promotions.js";
import {isOfferActive,parisCivilDay} from "../src/ingestion.js";
import {writeSourceSyncStatus} from "./source-sync-status.mjs";

const SNAPSHOT_URL=new URL("../data/import/carrefour-promotions-auto.json",import.meta.url);
const write=process.argv.includes("--write");
const current=new Date();
const today=parisCivilDay(current);
const nextReview=addDays(today,2);

const offers=JSON.parse(await readFile(SNAPSHOT_URL,"utf8"));
if(!Array.isArray(offers)) throw new Error("Snapshot Carrefour invalide.");

let confirmed=0;
let changed=0;
let unavailable=0;
let skippedExpired=0;
let skippedAccessDenied=0;
let unsafeUrls=0;
let accessDenied=false;
const confirmedExternalIds=[];
// A missed daily run must not cause permanent starvation: reviewAfter
// gates customer-facing offers, NOT attempts to collect new evidence.
// Explicit advertised expiry and start dates remain authoritative.
const canReconfirm=(offer)=>isOfferActive({...offer,reviewAfter:undefined},current);
const eligibleCount=offers.filter(canReconfirm).length;
const next=[];

for(const offer of offers){
  // An expired advertised campaign must never be revived, but an overdue
  // review may be reconsidered ONLY if today's official page proves the
  // original exact SKU, before/after prices and discount together.
  if(!canReconfirm(offer)){
    skippedExpired++;
    next.push(offer);
    continue;
  }
  // Validate the destination before fetching anything to avoid untrusted
  // URL requests from imported data, including redirects and lookalikes.
  if(!isAllowedCarrefourProductUrl(offer.sourceUrl,offer.eans)){
    unsafeUrls++;
    console.warn("[carrefour] URL officielle/EAN invalide · "+offer.title);
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
      redirect:"error",
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
    if(typeof offer.externalId==="string") confirmedExternalIds.push(offer.externalId);
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
  " · URLs invalides (non consultées)="+unsafeUrls+
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
    ? "Aucune référence Carrefour encore dans sa période annoncée à revalider : "+skippedExpired+" archive(s). De nouvelles fiches exigent une source publique accessible."
    : accessDenied
      ? "HTTP 401/403 : accès public aux fiches Carrefour refusé ; arrêt des requêtes suivantes sans contournement ("+skippedAccessDenied+" évitées)."
      : confirmed===eligibleCount
        ? "Toutes les fiches encore dans leur période ont été reconfirmées avec EAN et prix."
        : confirmed===0
          ? "Aucune promotion complète reconfirmée sur "+eligibleCount+" fiche(s) à recontrôler ("+unsafeUrls+" URL(s) refusée(s))."
          : "Seulement "+confirmed+"/"+eligibleCount+" promotions non expirées ont été reconfirmées.",
  extractedCount:confirmed,
  previousSnapshotCount:offers.length,
  confirmedExternalIds
},{write});

function addDays(iso,days){
  const date=new Date(iso+"T12:00:00Z");
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
