import {readFile,writeFile,appendFile} from "node:fs/promises";

// Per-provider state files prevent rebase conflicts between concurrent workflows.
export function sourceSyncStatusFile(source){
  if(!["carrefour","leclerc"].includes(source)){
    throw new Error("Source non prise en charge.");
  }
  return new URL("../data/import/source-sync-"+source+".json",import.meta.url);
}

export function makeSourceSyncStatus({
  status,reason="",extractedCount=0,previousSnapshotCount=0,
  checkedAt=new Date()
}={}){
  if(!["updated","partial","unavailable"].includes(status)){
    throw new Error("État de synchronisation inconnu.");
  }
  const date=new Date(checkedAt);
  if(Number.isNaN(date.getTime())) throw new Error("Date de synchronisation invalide.");
  for(const count of [extractedCount,previousSnapshotCount]){
    if(!Number.isInteger(count) || count<0) throw new Error("Nombre d'offres invalide.");
  }
  return {
    status,checkedAt:date.toISOString(),
    reason:String(reason).slice(0,220),
    extractedCount,previousSnapshotCount
  };
}

export async function writeSourceSyncStatus(source,args,{write=false}={}){
  const status=makeSourceSyncStatus(args);
  if(!write) return status;
  if(!["carrefour","leclerc"].includes(source)){
    throw new Error("Source non prise en charge.");
  }
  const file=sourceSyncStatusFile(source);
  const payload=JSON.parse(await readFile(file,"utf8"));
  if(!payload?.sources || typeof payload.sources!=="object" || Array.isArray(payload.sources)){
    throw new Error("Métadonnées de synchronisation invalides.");
  }
  payload.sources[source]=status;
  await writeFile(file,JSON.stringify(payload,null,2)+"\n","utf8");

  if(status.status!=="updated"){
    console.log("::warning title="+source+" non réactualisé complètement::"+
      status.reason.replace(/[\r\n:]/g," "));
  }
  if(process.env.GITHUB_STEP_SUMMARY){
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      "\n### "+source+" : "+status.status+"\n"+
      "- Confirmées : **"+status.extractedCount+" / "+status.previousSnapshotCount+"**\n"+
      "- "+status.reason.replace(/[|\r\n]/g," ")+"\n"+
      "- Les offres non confirmées conservent leurs dates de révision ; aucun taux n'est inventé.\n",
      "utf8"
    );
  }
  return status;
}
