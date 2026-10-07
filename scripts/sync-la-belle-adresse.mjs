import { readFile,writeFile } from "node:fs/promises";
import { parseLaBelleAdresseHtml } from "../src/adapters/la-belle-adresse.js";
import { validateImportBatch } from "../src/ingestion.js";

const SOURCE_URLS=[
  "https://www.labelleadresse.com/economies/remboursement",
  "https://www.labelleadresse.com/economies/remboursement-univers-linge",
  "https://www.labelleadresse.com/economies/remboursement-univers-maison"
];
const OUTPUT_URL=new URL("../data/import/la-belle-adresse-auto.json",import.meta.url);
const MANIFEST_URL=new URL("../data/import/index.json",import.meta.url);
const write=process.argv.includes("--write");
const minOffers=Math.max(4,Number(process.env.MIN_LBA_OFFERS||5));
const verifiedAt=new Date().toISOString().slice(0,10);

const found=[];
for(const url of SOURCE_URLS){
  try{
    const response=await fetch(url,{
      headers:{Accept:"text/html,application/xhtml+xml","User-Agent":"PromoAlimentaire/0.1 public-offer-sync"},
      redirect:"follow",signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) throw new Error("HTTP "+response.status);
    const html=await response.text();
    if(html.length<3000) throw new Error("réponse anormalement courte");
    const offers=parseLaBelleAdresseHtml(html,{verifiedAt,sourceUrl:url});
    console.log("[la-belle-adresse] "+url+" -> "+offers.length+" offre(s)");
    found.push(...offers);
  }catch(error){
    console.warn("[la-belle-adresse] "+url+" indisponible: "+error.message);
  }
}

const unique=new Map(found.map((offer)=>[offer.externalId,offer]));
const offers=[...unique.values()];
if(offers.length<minOffers){
  throw new Error("Extraction La Belle Adresse insuffisante : "+offers.length+" offre(s), minimum "+minOffers+".");
}
const validation=validateImportBatch(offers);
if(!validation.ok){
  const sample=validation.errors.slice(0,5).map((item)=>"index "+item.index+": "+item.errors.join(" | ")).join("\n");
  throw new Error("Snapshot La Belle Adresse invalide : "+validation.errors.length+" erreur(s).\n"+sample);
}

console.log("[la-belle-adresse] "+validation.normalized.length+" offres candidates validées.");
if(write){
  await writeFile(OUTPUT_URL,JSON.stringify(offers,null,2)+"\n","utf8");
  const manifest=JSON.parse(await readFile(MANIFEST_URL,"utf8"));
  const previous=Array.isArray(manifest.files)?manifest.files:[];
  manifest.verifiedAt=verifiedAt;
  manifest.files=[
    ...previous.filter((file)=>!/^la-belle-adresse.*\.json$/i.test(file)),
    "la-belle-adresse-auto.json"
  ];
  await writeFile(MANIFEST_URL,JSON.stringify(manifest,null,2)+"\n","utf8");
  console.log("[la-belle-adresse] snapshot et manifeste mis à jour.");
}else{
  console.log("[la-belle-adresse] dry-run : aucun fichier modifié.");
}
