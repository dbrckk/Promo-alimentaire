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

const pages={};
for(const [key,url] of Object.entries(SOURCES)){
  const response=await fetch(url,{
    headers:{Accept:"text/html,application/xhtml+xml","User-Agent":"PromoAlimentaire/0.1 public-payment-sync"},
    redirect:"follow",signal:AbortSignal.timeout(15000)
  });
  if(!response.ok) throw new Error(key+" HTTP "+response.status);
  const html=await response.text();
  if(html.length<1000) throw new Error(key+" réponse anormalement courte");
  pages[key]=html;
}

const offers=parsePaymentDiscountPages(pages,{verifiedAt});
if(offers.length<8) throw new Error("Extraction paiements insuffisante : "+offers.length+"/8.");
const validation=validateImportBatch(offers);
if(!validation.ok){
  const sample=validation.errors.slice(0,5).map((item)=>"index "+item.index+": "+item.errors.join(" | ")).join("\n");
  throw new Error("Snapshot paiement invalide : "+validation.errors.length+" erreur(s).\n"+sample);
}
console.log("[payments] "+validation.normalized.length+" taux publics validés.");
for(const offer of validation.normalized){
  console.log("[payments] "+offer.provider+" · "+offer.title+" · "+(offer.savingPercent ?? offer.savingAmount ?? "—"));
}

if(write){
  await writeFile(OUTPUT_URL,JSON.stringify(offers,null,2)+"\n","utf8");
  const manifest=JSON.parse(await readFile(MANIFEST_URL,"utf8"));
  const previous=Array.isArray(manifest.files)?manifest.files:[];
  manifest.verifiedAt=verifiedAt;
  manifest.files=[
    ...previous.filter((file)=>file!=="payment-discounts-auto.json"),
    "payment-discounts-auto.json"
  ];
  await writeFile(MANIFEST_URL,JSON.stringify(manifest,null,2)+"\n","utf8");
  console.log("[payments] snapshot et manifeste mis à jour.");
}
