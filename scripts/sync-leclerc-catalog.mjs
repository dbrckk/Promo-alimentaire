import { readFile,writeFile } from "node:fs/promises";
import { verifyLeclercCatalogOffer } from "../src/adapters/leclerc-catalog.js";
import {isOfferActive} from "../src/ingestion.js";
import {writeSourceSyncStatus} from "./source-sync-status.mjs";

const SNAPSHOT_URL=new URL("../data/import/leclerc-catalog-2026-10-07.json",import.meta.url);
const write=process.argv.includes("--write");
const today=new Date().toISOString().slice(0,10);

const offers=JSON.parse(await readFile(SNAPSHOT_URL,"utf8"));
if(!Array.isArray(offers)) throw new Error("Snapshot E.Leclerc invalide.");

// Catalogues from a finished campaign must not be queried again or have their
// verification date refreshed by a generic page left online.
const current=new Date();
const active=offers.filter((offer)=>isOfferActive(offer,current));
const skippedExpired=offers.length-active.length;
const pages=new Map();
const failures=[];
for(const url of [...new Set(active.map((offer)=>offer.sourceUrl).filter(Boolean))]){
  try{
    const response=await fetch(url,{
      headers:{
        Accept:"text/html,application/xhtml+xml",
        "User-Agent":"PromoAlimentaire/0.1 public-leclerc-catalog-verifier"
      },
      redirect:"follow",
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) throw new Error("HTTP "+response.status);
    const html=await response.text();
    if(html.length<500) throw new Error("réponse anormalement courte");
    pages.set(url,html);
    console.log("[leclerc] page récupérée : "+url);
  }catch(error){
    failures.push({url,error:error.message});
    console.warn("[leclerc] page indisponible : "+url+" · "+error.message);
  }
}

let verified=0;
let changed=0;
const next=offers.map((offer)=>{
  if(!isOfferActive(offer,current)) return offer;
  const html=pages.get(offer.sourceUrl);
  if(!html) return offer;

  const result=verifyLeclercCatalogOffer(html,offer);
  if(!result.ok){
    console.warn(
      "[leclerc] non confirmé : "+offer.title+" · "+result.reasons.join(" | ")
    );
    return offer;
  }

  verified+=1;
  if(offer.verifiedAt===today) return offer;
  changed+=1;
  console.log("[leclerc] confirmé : "+offer.title);
  return {
    ...offer,
    verifiedAt:today
  };
});

console.log(
  "[leclerc] "+verified+"/"+offers.length+" offre(s) confirmée(s) ; "+
  failures.length+" page(s) inaccessible(s) ; "+
  skippedExpired+" campagne(s) expirée(s) ignorée(s) ; "+changed+" mise(s) à jour."
);

if(write && changed>0){
  await writeFile(SNAPSHOT_URL,JSON.stringify(next,null,2)+"\n","utf8");
  console.log("[leclerc] snapshot mis à jour.");
}
await writeSourceSyncStatus("leclerc",{
  status:active.length>0 && verified===active.length?"updated"
    : verified===0?"unavailable":"partial",
  reason:active.length===0
    ? "Aucune campagne catalogue encore en cours ("+skippedExpired+" expirée(s)). Il faut découvrir les nouvelles opérations."
    : verified===active.length
      ? "Toutes les promotions encore dans leur période ont été reconfirmées."
      : verified===0 && pages.size>0
        ? "Pages catalogue accessibles, mais aucune preuve de produit/remise retrouvée dans leur HTML public (rendu dynamique possible). Flux officiel ou vérification manuelle nécessaire."
        : verified===0
          ? "Pages catalogue inaccessibles : "+failures.length+" échec(s) HTTP/réseau ; aucune offre reconfirmée."
          : "Seulement "+verified+"/"+active.length+" campagne(s) encore valides reconfirmée(s).",
  extractedCount:verified,
  previousSnapshotCount:offers.length
},{write});
