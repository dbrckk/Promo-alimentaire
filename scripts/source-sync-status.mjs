import {readFile,writeFile,appendFile} from "node:fs/promises";

// Per-provider state files prevent rebase conflicts between concurrent workflows.
const PROVIDER_STATUS_SOURCES=new Set(["carrefour","leclerc","shopmium"]);

export function sourceSyncStatusFile(source){
  if(!PROVIDER_STATUS_SOURCES.has(source)){
    throw new Error("Source non prise en charge.");
  }
  return new URL("../data/import/source-sync-"+source+".json",import.meta.url);
}

export function makeSourceSyncStatus({
  status,reason="",extractedCount=0,previousSnapshotCount=0,
  checkedAt=new Date(),confirmedExternalIds=undefined
}={}){
  if(!["updated","partial","unavailable"].includes(status)){
    throw new Error("État de synchronisation inconnu.");
  }
  const date=new Date(checkedAt);
  if(Number.isNaN(date.getTime())) throw new Error("Date de synchronisation invalide.");
  for(const count of [extractedCount,previousSnapshotCount]){
    if(!Number.isInteger(count) || count<0) throw new Error("Nombre d'offres invalide.");
  }
  // Partial source failures must not hide the individual records whose
  // original public campaign proof was successfully reconfirmed. Only the
  // synchronizer itself may emit these identities; absent metadata falls
  // back to conservative provider-wide warnings.
  let confirmed;
  if(confirmedExternalIds!==undefined){
    if(!Array.isArray(confirmedExternalIds) || confirmedExternalIds.length>2000
      || confirmedExternalIds.some((id)=>typeof id!=="string"
        || id.length===0 || id.length>200
        || !/^[A-Za-z0-9._:-]+$/.test(id))
      || new Set(confirmedExternalIds).size!==confirmedExternalIds.length
      || confirmedExternalIds.length>extractedCount
      || status==="unavailable" && confirmedExternalIds.length){
      throw new Error("Identifiants individuels reconfirmés invalides.");
    }
    confirmed=[...confirmedExternalIds].sort();
  }
  return {
    status,checkedAt:date.toISOString(),
    reason:String(reason).slice(0,220),
    extractedCount,previousSnapshotCount,
    ...(confirmed===undefined?{}:{confirmedExternalIds:confirmed})
  };
}

export async function writeSourceSyncStatus(source,args,{write=false}={}){
  const status=makeSourceSyncStatus(args);
  if(!write) return status;
  // Each provider owns its own diagnostics file, so concurrent sync commits
  // never need to merge unrelated supplier updates.
  const file=sourceSyncStatusFile(source);
  const payload=JSON.parse(await readFile(file,"utf8"));
  if(!payload?.sources || typeof payload.sources!=="object" || Array.isArray(payload.sources)){
    throw new Error("Métadonnées de synchronisation invalides.");
  }
  // Keep a bounded audit trail of individual public confirmations.
  // A later bot/browser outage must not erase genuine proofs from minutes
  // earlier, even though the newer sync status correctly remains unavailable.
  // These historical proofs do NOT extend the original offer expiry.
  const previous=payload.sources[source]?.lastConfirmedAtById || {};
  const nowMs=new Date(status.checkedAt).getTime();
  const cutoff=nowMs-7*24*60*60*1000;
  const proofs={};
  if(previous && typeof previous==="object" && !Array.isArray(previous)){
    for(const [id,stamp] of Object.entries(previous)){
      if(typeof id!=="string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(id)
        || typeof stamp!=="string") continue;
      const instant=new Date(stamp).getTime();
      if(Number.isFinite(instant) && instant>=cutoff && instant<=nowMs)
        proofs[id]=new Date(instant).toISOString();
    }
  }
  for(const id of status.confirmedExternalIds || []){
    proofs[id]=status.checkedAt;
  }
  status.lastConfirmedAtById=Object.fromEntries(
    Object.entries(proofs)
      .sort((a,b)=>new Date(b[1])-new Date(a[1]) || a[0].localeCompare(b[0]))
      .slice(0,2000)
  );
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
