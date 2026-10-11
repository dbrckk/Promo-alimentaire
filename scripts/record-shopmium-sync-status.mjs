import {readFile} from "node:fs/promises";
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
// Use the exact per-run machine-readable result from the synchronization
// step. The verifiedAt ISO day alone cannot distinguish yesterday's record
// from an offer fetched earlier on the same day.
function requiredCount(value,name){
  if(typeof value!=="string" || !/^\\d+$/.test(value)){
    throw new Error(name+" manquant ou non numérique après synchronisation réussie.");
  }
  const count=Number(value);
  if(!Number.isSafeInteger(count) || count<0) throw new Error(name+" invalide.");
  return count;
}
let confirmed=0;
let retained=records.length;
if(outcome==="success"){
  confirmed=requiredCount(process.env.SHOPMIUM_CONFIRMED_COUNT,"confirmed_count");
  retained=requiredCount(process.env.SHOPMIUM_RETAINED_COUNT,"retained_count");
  const written=requiredCount(process.env.SHOPMIUM_SNAPSHOT_COUNT,"snapshot_count");
  if(confirmed+retained!==written || written!==records.length){
    throw new Error("Incohérence entre fiches réellement vérifiées, retenues et snapshot publié.");
  }
}
const allConfirmed=outcome==="success"
  && records.length>0 && confirmed===records.length;
const status=allConfirmed ? "updated"
  : outcome==="success" && confirmed>0 ? "partial" : "unavailable";
const reason=outcome==="failure"
  ? "Actualisation publique Shopmium interrompue. Ancien snapshot conservé avec ses dates originales ; consulter les journaux Actions pour la cause."
  : confirmed===0
    ? "Synchronisation terminée, mais aucune fiche publique n'a pu être reconfirmée dans cette exécution."
    : retained>0
      ? confirmed+"/"+records.length+" fiches vérifiées lors de cette exécution ; "+retained+" autre(s) conservent leur preuve antérieure."
      : "Les "+confirmed+" fiches actives du snapshot ont été reconfirmées dans cette exécution Shopmium.";

await writeSourceSyncStatus("shopmium",{
  status,reason,extractedCount:confirmed,
  previousSnapshotCount:records.length,checkedAt:now
},{write:process.argv.includes("--write")});
console.log("[shopmium-status] "+status+" · "+confirmed+"/"+records.length+
  " actives reconfirmées · "+(outcome==="failure"?"source indisponible":"synchronisation réussie"));
