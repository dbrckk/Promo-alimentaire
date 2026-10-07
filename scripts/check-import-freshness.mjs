import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isOfferActive, validateImportBatch } from "../src/ingestion.js";

const directory=new URL("../data/import/",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("index.json",directory),"utf8"));
const files=[...new Set(Array.isArray(manifest?.files) ? manifest.files : [])]
  .filter((name)=>typeof name==="string" && name.endsWith(".json") && name!=="index.json")
  .sort();

const now=new Date(process.env.CHECK_DATE || new Date().toISOString());
const strict=process.argv.includes("--strict");
const warningDays=Number(process.env.WARNING_DAYS || 3);

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
  activeTotal+=active.length;
  const nextDeadlines=validation.normalized
    .flatMap((offer)=>[offer.reviewAfter,offer.expiresAt].filter(Boolean))
    .map((value)=>new Date(String(value).length===10 ? value+"T23:59:59Z" : value))
    .filter((date)=>!Number.isNaN(date.getTime()) && date>=now)
    .sort((a,b)=>a-b);
  const nextDeadline=nextDeadlines[0] || null;
  const daysUntil=nextDeadline
    ? Math.ceil((nextDeadline-now)/(24*60*60*1000))
    : null;

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
    nextDeadline:nextDeadline?.toISOString() || null,
    daysUntil
  });
}

for(const item of report){
  const deadline=item.nextDeadline ? ` · échéance ${item.nextDeadline.slice(0,10)} (${item.daysUntil} j)` : "";
  const error=item.error ? ` · ${item.error}` : "";
  console.log(`[freshness] ${item.file}: ${item.status} · ${item.active}/${item.total} actives${deadline}${error}`);
}
console.log(`[freshness] Manifeste: ${files.length} fichier(s) · ${activeTotal} offres actives · ${staleFiles} source(s) problématique(s)`);

if(strict && staleFiles>0) process.exitCode=1;
