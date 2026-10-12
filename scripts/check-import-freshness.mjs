import { readFile,appendFile } from "node:fs/promises";
import { join } from "node:path";
import { isOfferActive, validateImportBatch } from "../src/ingestion.js";
import {failedRefreshWarning, sourceDeadlineSummary} from "../src/import-loader.js";
import {inspectImportManifest} from "../src/import-manifest.js";

const directory=new URL("../data/import/",import.meta.url);
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
let activeTotal=0;
const report=[];

for(const file of files){
  const path=join(directory.pathname,file);
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
  const failedProviders=new Set(active.filter((offer)=>
    failedRefreshWarning(offer,sourceSync,now)
  ).map((offer)=>offer.providerId));
  const syncWarning=providers
    .filter((id)=>active.length===0 || failedProviders.has(id))
    .map((id)=>sourceSync[id])
    .find((entry)=>["unavailable","partial"].includes(entry?.status)
      && Number.isFinite(new Date(entry.checkedAt).getTime())
      && new Date(entry.checkedAt)<=now) || null;
  activeTotal+=active.length;
  const {nextDeadline,daysUntil}=sourceDeadlineSummary(active,now);

  let status="ok";
  if(active.length===0){
    status="stale";
    staleFiles+=1;
  }else if(daysUntil!==null && daysUntil<=warningDays){
    status="review-soon";
  }

  report.push({
    file,
    status,
    active:active.length,
    total:validation.normalized.length,
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
  console.log(`[freshness] ${item.file}: ${item.status} · ${item.active}/${item.total} actives${deadline}${error}${sourceNote}`);
  const severity=["stale","missing-or-invalid","invalid"].includes(item.status)
    ? strict ? "error" : "warning"
    : item.status==="review-soon" ? "warning" : null;
  if(severity){
    const context=item.syncWarning ? " ; source "+item.syncWarning.status+" : "+item.syncWarning.reason : "";
    const message=("Offres actives "+item.active+"/"+item.total+context)
      .replace(/%/g,"%25").replace(/\r/g,"%0D").replace(/\n/g,"%0A");
    console.log(`::${severity} file=data/import/${item.file},title=Fraîcheur ${item.status}::${message}`);
  }
}
console.log(`[freshness] Manifeste: ${files.length} fichier(s) · ${activeTotal} offres actives · ${staleFiles} source(s) problématique(s)`);

if(process.env.GITHUB_STEP_SUMMARY){
  const clean=(value)=>String(value??"").replace(/[|\r\n]/g," ").slice(0,220);
  const lines=[
    "## Fraîcheur du catalogue public",
    "",
    "Les offres expirées restent exclues de la PWA ; un fournisseur inaccessible ne prolonge jamais les dates de preuve.",
    "",
    "| Source | Statut | Offres actives | Prochaine échéance | Dernière synchronisation |",
    "| --- | --- | ---: | --- | --- |",
    ...report.map((item)=>
      "| "+clean(item.file)+" | "+clean(item.status)+" | "+
      item.active+"/"+item.total+" | "+
      clean(item.nextDeadline?.slice(0,10)||"—")+" | "+
      clean(item.syncWarning
        ? item.syncWarning.status+": "+item.syncWarning.reason
        : "—")+" |"
    ),
    "",
    "**Total : "+activeTotal+" offres actives ; "+staleFiles+
      " fichier(s) sans offre utilisable ou invalide(s).**",
    strict && staleFiles>0
      ? "Contrôle strict en échec : restaurer une source vérifiable, sans réactiver les anciennes offres."
      : "Contrôle terminé.",
    ""
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join("\n"),"utf8");
}
if(strict && staleFiles>0) process.exitCode=1;
