import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateImportBatch } from "../src/ingestion.js";
import { validatePaymentRateSafety } from "../src/adapters/payment-discounts.js";

const directory=new URL("../data/import/",import.meta.url);
let files=[];
try{
  files=(await readdir(directory))
    .filter((name)=>name.endsWith(".json") && !["index.json","source-sync-status.json"].includes(name))
    .sort();
}catch(error){
  if(error.code!=="ENOENT") throw error;
}

let failed=false;
let total=0;

for(const file of files){
  const path=join(directory.pathname,file);
  const content=await readFile(path,"utf8");
  let parsed;
  try{
    parsed=JSON.parse(content);
  }catch(error){
    failed=true;
    console.error(`[import] ${file}: JSON invalide — ${error.message}`);
    continue;
  }
  const records=Array.isArray(parsed) ? parsed : parsed.offers;
  const result=validateImportBatch(records);
  total+=Array.isArray(records) ? records.length : 0;
  if(!result.ok){
    failed=true;
    console.error(`[import] ${file}: ${result.errors.length} erreur(s)`);
    for(const issue of result.errors){
      console.error(`  index ${issue.index}: ${issue.errors.join(" | ")}`);
    }
  }else{
    if(file==="payment-discounts-auto.json"){
      const unsafe=result.normalized
        .map((offer,index)=>({index,offer,safety:validatePaymentRateSafety(offer)}))
        .filter((item)=>!item.safety.ok);
      if(unsafe.length){
        failed=true;
        console.error(`[import] ${file}: ${unsafe.length} taux de paiement hors garde-fou`);
        for(const item of unsafe){
          console.error(`  index ${item.index}: ${item.safety.reason}`);
        }
      }else{
        console.log(`[import] ${file}: ${result.normalized.length} offre(s) valides + garde-fous paiement OK`);
      }
    }else{
      console.log(`[import] ${file}: ${result.normalized.length} offre(s) valides`);
    }
  }
}

// Sync diagnostics are metadata, not a batch of product offers.
try{
  const status=JSON.parse(await readFile(new URL("source-sync-status.json",directory),"utf8"));
  if(!status || typeof status!=="object" || Array.isArray(status)
    || !status.sources || typeof status.sources!=="object" || Array.isArray(status.sources)){
    throw new Error("le champ sources doit être un objet");
  }
  for(const [provider,source] of Object.entries(status.sources)){
    if(!provider || !["updated","partial","unavailable"].includes(source?.status)
      || !Number.isFinite(new Date(source?.checkedAt).getTime())
      || !Number.isInteger(source?.extractedCount) || source.extractedCount<0
      || !Number.isInteger(source?.previousSnapshotCount) || source.previousSnapshotCount<0
      || typeof source?.reason!=="string"){
      throw new Error("statut de synchronisation invalide : "+provider);
    }
  }
  console.log("[sync-health] "+Object.keys(status.sources).length+" statut(s) source valide(s)");
}catch(error){
  failed=true;
  console.error("[sync-health] Métadonnées invalides : "+error.message);
}

console.log(`[import] ${files.length} fichier(s), ${total} offre(s) examinées`);
if(failed) process.exitCode=1;
