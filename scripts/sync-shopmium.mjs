import { readFile,writeFile } from "node:fs/promises";
import { extractShopmiumOfferUrls,parseShopmiumDetailHtml } from "../src/adapters/shopmium.js";
import { isOfferActive,validateImportBatch } from "../src/ingestion.js";

const INDEX_URL="https://offers.shopmium.com/fr/";
const OUTPUT_URL=new URL("../data/import/shopmium-auto.json",import.meta.url);
const MANIFEST_URL=new URL("../data/import/index.json",import.meta.url);
const write=process.argv.includes("--write");
const minOffers=Math.max(5,Number(process.env.MIN_SHOPMIUM_OFFERS||12));
const verifiedAt=new Date().toISOString().slice(0,10);
const now=new Date(verifiedAt+"T12:00:00Z");

const indexResponse=await fetch(INDEX_URL,{
  headers:{Accept:"text/html,application/xhtml+xml","User-Agent":"PromoAlimentaire/0.1 public-offer-sync"},
  redirect:"follow",signal:AbortSignal.timeout(15000)
});
if(!indexResponse.ok) throw new Error("Shopmium index HTTP "+indexResponse.status);
const indexHtml=await indexResponse.text();
if(indexHtml.length<5000) throw new Error("Réponse Shopmium anormalement courte.");

const urls=extractShopmiumOfferUrls(indexHtml);
if(urls.length<minOffers) throw new Error("Découverte Shopmium insuffisante : "+urls.length+" URL(s).");
console.log("[shopmium] "+urls.length+" fiches publiques découvertes.");

const parsed=[];
const batchSize=10;
for(let start=0;start<urls.length;start+=batchSize){
  const batch=urls.slice(start,start+batchSize);
  const results=await Promise.all(batch.map(async(url)=>{
    try{
      const response=await fetch(url,{
        headers:{Accept:"text/html,application/xhtml+xml","User-Agent":"PromoAlimentaire/0.1 public-offer-sync"},
        redirect:"follow",signal:AbortSignal.timeout(12000)
      });
      if(!response.ok) return null;
      return parseShopmiumDetailHtml(await response.text(),url,{verifiedAt});
    }catch{return null;}
  }));
  parsed.push(...results.filter(Boolean));
  await new Promise((resolve)=>setTimeout(resolve,80));
}

const byId=new Map(parsed.map((offer)=>[offer.externalId,offer]));
const active=[...byId.values()].filter((offer)=>isOfferActive(offer,now));
if(active.length<minOffers){
  throw new Error("Extraction Shopmium active insuffisante : "+active.length+" offre(s), minimum "+minOffers+".");
}
const validation=validateImportBatch(active);
if(!validation.ok){
  const sample=validation.errors.slice(0,5).map((item)=>"index "+item.index+": "+item.errors.join(" | ")).join("\n");
  throw new Error("Snapshot Shopmium invalide : "+validation.errors.length+" erreur(s).\n"+sample);
}

console.log("[shopmium] "+validation.normalized.length+" offres actives validées.");
if(write){
  await writeFile(OUTPUT_URL,JSON.stringify(active,null,2)+"\n","utf8");
  const manifest=JSON.parse(await readFile(MANIFEST_URL,"utf8"));
  const previous=Array.isArray(manifest.files)?manifest.files:[];
  manifest.verifiedAt=verifiedAt;
  manifest.files=[
    ...previous.filter((file)=>!/^shopmium.*\.json$/i.test(file)),
    "shopmium-auto.json"
  ];
  await writeFile(MANIFEST_URL,JSON.stringify(manifest,null,2)+"\n","utf8");
  console.log("[shopmium] snapshot et manifeste mis à jour.");
}else{
  console.log("[shopmium] dry-run : aucun fichier modifié.");
}
