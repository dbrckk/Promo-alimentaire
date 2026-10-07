import { readFile, writeFile } from "node:fs/promises";
import { parseCouponNetworkHtml } from "../src/adapters/coupon-network.js";
import { validateImportBatch } from "../src/ingestion.js";

const SOURCE_URL="https://www.couponnetwork.fr/index.rss";
const OUTPUT_URL=new URL("../data/import/coupon-network-auto.json",import.meta.url);
const MANIFEST_URL=new URL("../data/import/index.json",import.meta.url);
const write=process.argv.includes("--write");
const minOffers=Math.max(10,Number(process.env.MIN_COUPON_NETWORK_OFFERS || 20));
const verifiedAt=new Date().toISOString().slice(0,10);

const response=await fetch(SOURCE_URL,{
  headers:{
    Accept:"text/html,application/xhtml+xml",
    "User-Agent":"PromoAlimentaire/0.1 public-offer-sync"
  },
  redirect:"follow"
});
if(!response.ok) throw new Error("Coupon Network HTTP "+response.status);
const html=await response.text();
if(html.length<5000) throw new Error("Réponse Coupon Network anormalement courte.");

let offers=parseCouponNetworkHtml(html,{verifiedAt});
if(offers.length<minOffers){
  const { extractCouponNetworkDetailUrls, parseCouponNetworkDetailHtml } = await import("../src/adapters/coupon-network.js");
  const urls=extractCouponNetworkDetailUrls(html);
  console.log("[coupon-network] liste directe insuffisante ("+offers.length+"), bascule sur "+urls.length+" fiches publiques uniques.");
  const details=[];
  const batchSize=6;
  for(let start=0;start<urls.length;start+=batchSize){
    const batch=urls.slice(start,start+batchSize);
    const results=await Promise.all(batch.map(async(url)=>{
      try{
        const detailResponse=await fetch(url,{
          headers:{Accept:"text/html,application/xhtml+xml","User-Agent":"PromoAlimentaire/0.1 public-offer-sync"},
          redirect:"follow"
        });
        if(!detailResponse.ok) return null;
        const detailHtml=await detailResponse.text();
        return parseCouponNetworkDetailHtml(detailHtml,url,{verifiedAt});
      }catch{
        return null;
      }
    }));
    details.push(...results.filter(Boolean));
    await new Promise((resolve)=>setTimeout(resolve,120));
  }
  const unique=new Map(details.map((offer)=>[offer.externalId,offer]));
  offers=[...unique.values()];
}
if(offers.length<minOffers){
  throw new Error("Extraction Coupon Network insuffisante : "+offers.length+" offre(s), minimum "+minOffers+". Ancien snapshot conservé.");
}

const validation=validateImportBatch(offers);
if(!validation.ok){
  const sample=validation.errors.slice(0,5).map((item)=>"index "+item.index+": "+item.errors.join(" | ")).join("\n");
  throw new Error("Snapshot généré invalide : "+validation.errors.length+" erreur(s).\n"+sample);
}

console.log("[coupon-network] "+validation.normalized.length+" offres candidates extraites et validées.");
console.log("[coupon-network] Aucune offre générée n’est autoStack ni EAN exact.");

if(write){
  await writeFile(OUTPUT_URL,JSON.stringify(offers,null,2)+"\n","utf8");
  const manifest=JSON.parse(await readFile(MANIFEST_URL,"utf8"));
  const previous=Array.isArray(manifest.files) ? manifest.files : [];
  manifest.verifiedAt=verifiedAt;
  manifest.files=[
    ...previous.filter((file)=>!/^coupon-network.*\.json$/i.test(file)),
    "coupon-network-auto.json"
  ];
  await writeFile(MANIFEST_URL,JSON.stringify(manifest,null,2)+"\n","utf8");
  console.log("[coupon-network] snapshot et manifeste mis à jour.");
}else{
  console.log("[coupon-network] dry-run : aucun fichier modifié.");
}
