import { readFile,appendFile } from "node:fs/promises";
import { join,resolve,sep } from "node:path";
import { pathToFileURL,fileURLToPath } from "node:url";
import { isOfferActive, validateImportBatch } from "../src/ingestion.js";
import {sourceRefreshImpact, sourceDeadlineSummary} from "../src/import-loader.js";
import {inspectImportManifest} from "../src/import-manifest.js";

// The command always reads production imports, except when its existing
// integration scenario explicitly supplies a disposable fixture directory.
// This keeps CI assertions deterministic even after daily source syncs write
// newer timestamps or replace campaign snapshots.
const fixturePath=process.env.NODE_ENV==="test"
  ? process.env.PROMO_FRESHNESS_FIXTURE_DIR : null;
const directory=fixturePath
  ? pathToFileURL(resolve(fixturePath)+sep)
  : new URL("../data/import/",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("index.json",directory),"utf8"));
const checkedManifest=inspectImportManifest(manifest);
if(!checkedManifest.ok){
  throw new Error("Manifeste invalide : "+checkedManifest.issues.join(" "));
}
const files=checkedManifest.files.sort();

const now=new Date(process.env.CHECK_DATE || new Date().toISOString());
const strict=process.argv.includes("--strict");
const warningDays=Number(process.env.WARNING_DAYS || 3);

// Distinguish an expired catalog from an unreachable provider. Both are
// actionable, but neither is evidence that historical offers are live.
const sourceSync={};
for(const file of ["source-sync-status.json","source-sync-carrefour.json","source-sync-leclerc.json","source-sync-shopmium.json"]){
  try{
    const data=JSON.parse(await readFile(new URL(file,directory),"utf8"));
    if(data?.sources && typeof data.sources==="object" && !Array.isArray(data.sources)){
      Object.assign(sourceSync,data.sources);
    }
  }catch{
    // Legacy repositories might not have source-sync diagnostics.
  }
}

let staleFiles=0;
let archivedFiles=0;
let activeTotal=0;
let affectedTotal=0;
let warningFiles=0;
const report=[];

for(const file of files){
  const path=join(fileURLToPath(directory),file);
  let parsed;
  try{
    parsed=JSON.parse(await readFile(path,"utf8"));
  }catch(error){
    report.push({file,status:"missing-or-invalid",active:0,total:0,error:error.message});
    staleFiles+=1;
    continue;
  }

  const records=Array.isArray(parsed) ? parsed : parsed.offers;
  const validation=validateImportBatch(records);
  if(!validation.ok){
    report.push({file,status:"invalid",active:0,total:Array.isArray(records)?records.length:0});
    staleFiles+=1;
    continue;
  }

  const active=validation.normalized.filter((offer)=>isOfferActive(offer,now));
  const providers=[...new Set(validation.normalized.map((offer)=>offer.providerId).filter(Boolean))];
  // Same evidence gate as the PWA: a past or future failed refresh does
  // not invalidate a newer verification, and expired offers do not create
  // future review deadlines in the GitHub Actions report.
  const refreshImpact=sourceRefreshImpact(active,sourceSync,now);
  const failedProviders=new Set(refreshImpact.affectedProviderIds);
  const syncWarning=providers
    .filter((id)=>active.length===0 || failedProviders.has(id))
    .map((id)=>sourceSync[id])
    .find((entry)=>["unavailable","partial"].includes(entry?.status)
      && Number.isFinite(new Date(entry.checkedAt).getTime())
      && new Date(entry.checkedAt)<=now) || null;
  activeTotal+=active.length;
  affectedTotal+=refreshImpact.affectedCount;
  const {nextDeadline,daysUntil}=sourceDeadlineSummary(active,now);

  let status="ok";
  const archivalReason=checkedManifest.archivedOnly[file] || null;
  if(active.length===0 && archivalReason){
    status="archived";
    archivedFiles+=1;
  }else if(active.length===0){
    status="stale";
    staleFiles+=1;
  }else if(archivalReason){
    // A formerly historical-only file regained active campaigns. Its explicit
    // archive exception must be removed before the strict report can pass.
    status="archive-active";
    staleFiles+=1;
  }else if(refreshImpact.affectedCount>0){
    status="sync-warning";
    warningFiles+=1;
  }else if(daysUntil!==null && daysUntil<=warningDays){
    status="review-soon";
  }

  report.push({
    file,
    status,
    active:active.length,
    affected:refreshImpact.affectedCount,
    total:validation.normalized.length,
    archivalReason,
    nextDeadline,
    daysUntil,
    syncWarning:syncWarning ? {
      status:syncWarning.status,
      checkedAt:syncWarning.checkedAt,
      reason:String(syncWarning.reason || "").slice(0,200)
    } : null
  });
}

for(const item of report){
  const deadline=item.nextDeadline ? ` · échéance ${item.nextDeadline.slice(0,10)} (${item.daysUntil} j)` : "";
  const error=item.error ? ` · ${item.error}` : "";
  const sourceNote=item.syncWarning
    ? " · synchro "+item.syncWarning.status+": "+item.syncWarning.reason
    : "";
  const archiveNote=item.archivalReason
    ? " · exception historique documentée : "+item.archivalReason
    : "";
  const affectedNote=item.affected>0
    ? " · "+item.affected+" offre(s) sous alerte de synchronisation"
    : "";
  console.log(`[freshness] ${item.file}: ${item.status} · ${item.active}/${item.total} actives${affectedNote}${deadline}${error}${sourceNote}${archiveNote}`);
  const severity=["stale","missing-or-invalid","invalid","archive-active"].includes(item.status)
    ? strict ? "error" : "warning"
    : ["review-soon","sync-warning","archived"].includes(item.status) ? "warning" : null;
  if(severity){
    const context=item.syncWarning ? " ; source "+item.syncWarning.status+" : "+item.syncWarning.reason : "";
    const message=("Offres actives "+item.active+"/"+item.total
      +" ; "+(item.affected||0)+" sous alerte de synchronisation"+context)
      .replace(/%/g,"%25").replace(/\r/g,"%0D").replace(/\n/g,"%0A");
    console.log(`::${severity} file=data/import/${item.file},title=Fraîcheur ${item.status}::${message}`);
  }
}
console.log(`[freshness] Manifeste: ${files.length} fichier(s) · ${activeTotal} offres actives · ${affectedTotal} sous alerte de synchronisation · ${staleFiles} fichier(s) périmé(s)/invalide(s) · ${archivedFiles} fichier(s) en archive historique explicite · ${warningFiles} fichier(s) dont la synchronisation a échoué`);

if(process.env.GITHUB_STEP_SUMMARY){
  const clean=(value)=>String(value??"").replace(/[|\r\n]/g," ").slice(0,220);
  const lines=[
    "## Fraîcheur du catalogue public",
    "",
    "Les offres expirées restent exclues de la PWA ; un fournisseur inaccessible ne prolonge jamais les dates de preuve.",
    "",
    "| Source | Statut | Offres actives | Sous alerte de synchronisation | Prochaine échéance | Dernière synchronisation |",
    "| --- | --- | ---: | ---: | --- | --- |",
    ...report.map((item)=>
      "| "+clean(item.file)+" | "+clean(item.status)+" | "+
      item.active+"/"+item.total+" | "+(item.affected||0)+" | "+
      clean(item.nextDeadline?.slice(0,10)||"—")+" | "+
      clean(item.syncWarning
        ? item.syncWarning.status+": "+item.syncWarning.reason
        : "—")+" |"
    ),
    "",
    "**Total : "+activeTotal+" offres actives dont "+affectedTotal+
      " sous alerte de synchronisation ; "+staleFiles+
      " fichier(s) sans offre utilisable hors archives ou invalide(s) ; "+archivedFiles+
      " archive(s) historiques documentée(s) ; "+warningFiles+
      " fichier(s) actif(s) en échec de synchronisation.**",
    strict && staleFiles>0
      ? "Contrôle strict en échec : restaurer une source vérifiable, sans réactiver les anciennes offres."
      : "Contrôle terminé.",
    ""
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join("\n"),"utf8");
}
if(strict && staleFiles>0) process.exitCode=1;
