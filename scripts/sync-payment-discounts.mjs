import { readFile,writeFile } from "node:fs/promises";
import { parsePaymentDiscountPages } from "../src/adapters/payment-discounts.js";
import { validateImportBatch } from "../src/ingestion.js";

const SOURCES={
  fidme:"https://www.fidme.com/nos-avantages/bons-dachats/",
  widilo:"https://www.widilo.fr/bon-d-achat/carrefour",
  ebuyclubGiftCard:"https://www.ebuyclub.com/selection-bons-d-achat/carrefour-courses-alimentaires-10310",
  poulpeo:"https://www.poulpeo.com/cashback-bon-d-achat.html",
  ebuyclubConnected:"https://www.ebuyclub.com/cashback-connecte",
  ebuyclubOnline:"https://www.ebuyclub.com/cashback"
};
const OUTPUT_URL=new URL("../data/import/payment-discounts-auto.json",import.meta.url);
const MANIFEST_URL=new URL("../data/import/index.json",import.meta.url);
const write=process.argv.includes("--write");
const verifiedAt=new Date().toISOString().slice(0,10);

let previous=[];
try{
  previous=JSON.parse(await readFile(OUTPUT_URL,"utf8"));
  if(!Array.isArray(previous)) previous=[];
}catch{
  previous=[];
}

const pages={};
const failures=[];
for(const [key,url] of Object.entries(SOURCES)){
  try{
    const response=await fetch(url,{
      headers:{
        Accept:"text/html,application/xhtml+xml",
        "User-Agent":"PromoAlimentaire/0.1 public-payment-sync"
      },
      redirect:"follow",
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) throw new Error("HTTP "+response.status);
    const html=await response.text();
    if(html.length<1000) throw new Error("réponse anormalement courte");
    pages[key]=html;
    console.log("[payments] "+key+" récupéré.");
  }catch(error){
    failures.push({key,error:error.message});
    console.warn("[payments] "+key+" indisponible : "+error.message+" ; fallback conservé.");
  }
}

const fresh=parsePaymentDiscountPages(pages,{verifiedAt});
const merged=new Map();
for(const offer of previous) merged.set(identity(offer),offer);
for(const offer of fresh) merged.set(identity(offer),offer);
const offers=[...merged.values()];

if(offers.length<8){
  throw new Error(
    "Extraction/fallback paiements insuffisant : "+offers.length+
    "/8. Ancien snapshot incomplet ou indisponible."
  );
}
const validation=validateImportBatch(offers);
if(!validation.ok){
  const sample=validation.errors.slice(0,5)
    .map((item)=>"index "+item.index+": "+item.errors.join(" | "))
    .join("\n");
  throw new Error(
    "Snapshot paiement invalide : "+validation.errors.length+" erreur(s).\n"+sample
  );
}

console.log(
  "[payments] "+validation.normalized.length+" taux disponibles ; "+
  fresh.length+" rafraîchis ; "+failures.length+" source(s) en fallback."
);
for(const offer of validation.normalized){
  console.log(
    "[payments] "+offer.provider+" · "+offer.title+" · "+
    (offer.savingPercent ?? offer.savingAmount ?? "—")+" · vérifié "+offer.verifiedAt
  );
}

if(write){
  await writeFile(OUTPUT_URL,JSON.stringify(offers,null,2)+"\n","utf8");
  const manifest=JSON.parse(await readFile(MANIFEST_URL,"utf8"));
  const previousFiles=Array.isArray(manifest.files)?manifest.files:[];
  manifest.verifiedAt=verifiedAt;
  manifest.files=[
    ...previousFiles.filter((file)=>file!=="payment-discounts-auto.json"),
    "payment-discounts-auto.json"
  ];
  await writeFile(MANIFEST_URL,JSON.stringify(manifest,null,2)+"\n","utf8");
  console.log("[payments] snapshot et manifeste mis à jour.");
}

function identity(offer){
  return [
    offer?.providerId || offer?.provider || "?",
    offer?.mechanism || "?",
    [...(offer?.stores || [])].sort().join(","),
    [...(offer?.channels || [])].sort().join(",")
  ].join("|");
}
