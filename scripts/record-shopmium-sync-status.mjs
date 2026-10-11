import {readFile} from "node:fs/promises";
import {isOfferActive} from "../src/ingestion.js";
import {writeSourceSyncStatus} from "./source-sync-status.mjs";

// Run after Shopmium synchronization, even when the supplier denies access.
// The supplier job may fail without changing its last verified snapshot:
// record that failure without advancing a single offer's proof or review date.
const outcome=process.env.SHOPMIUM_SYNC_OUTCOME;
if(!["success","failure"].includes(outcome)){
  throw new Error("SHOPMIUM_SYNC_OUTCOME doit indiquer success ou failure.");
}

const file=new URL("../data/import/shopmium-auto.json",import.meta.url);
const records=JSON.parse(await readFile(file,"utf8"));
if(!Array.isArray(records)) throw new Error("Snapshot Shopmium invalide.");
const now=new Date();
const today=now.toISOString().slice(0,10);
const active=records.filter((offer)=>isOfferActive(offer,now));
const confirmed=outcome==="success"
  ? active.filter((offer)=>offer.verifiedAt===today).length : 0;
const allConfirmed=outcome==="success"
  && active.length>0 && confirmed===active.length;
const status=allConfirmed ? "updated"
  : outcome==="success" && confirmed>0 ? "partial" : "unavailable";
const reason=outcome==="failure"
  ? "Actualisation publique Shopmium interrompue. Ancien snapshot conservé avec ses dates originales ; consulter les journaux Actions pour la cause."
  : confirmed===0
    ? "Synchronisation terminée, mais aucune offre active n'a été reconfirmée aujourd'hui ; ne pas garantir les anciennes."
    : confirmed<active.length
      ? confirmed+"/"+active.length+" offres actives vérifiées sur leurs fiches ; les autres conservent leur ancienne date de révision."
      : "Toutes les "+confirmed+" offres Shopmium actives ont été reconfirmées sur les pages officielles.";

await writeSourceSyncStatus("shopmium",{
  status,reason,extractedCount:confirmed,
  previousSnapshotCount:active.length,checkedAt:now
},{write:process.argv.includes("--write")});
console.log("[shopmium-status] "+status+" · "+confirmed+"/"+active.length+
  " actives reconfirmées · "+(outcome==="failure"?"source indisponible":"synchronisation réussie"));
