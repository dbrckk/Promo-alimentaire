import { readFile,writeFile } from "node:fs/promises";
import { verifyLeclercCatalogOffer } from "../src/adapters/leclerc-catalog.js";

const SNAPSHOT_URL=new URL("../data/import/leclerc-catalog-2026-10-07.json",import.meta.url);
const write=process.argv.includes("--write");
const today=new Date().toISOString().slice(0,10);

const offers=JSON.parse(await readFile(SNAPSHOT_URL,"utf8"));
if(!Array.isArray(offers)) throw new Error("Snapshot E.Leclerc invalide.");

const pages=new Map();
const failures=[];
for(const url of [...new Set(offers.map((offer)=>offer.sourceUrl).filter(Boolean))]){
  try{
    const response=await fetch(url,{
      headers:{
        Accept:"text/html,application/xhtml+xml",
        "User-Agent":"PromoAlimentaire/0.1 public-leclerc-catalog-verifier"
      },
      redirect:"follow",
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) throw new Error("HTTP "+response.status);
    const html=await response.text();
    if(html.length<500) throw new Error("réponse anormalement courte");
    pages.set(url,html);
    console.log("[leclerc] page récupérée : "+url);
  }catch(error){
    failures.push({url,error:error.message});
    console.warn("[leclerc] page indisponible : "+url+" · "+error.message);
  }
}

let verified=0;
let changed=0;
const next=offers.map((offer)=>{
  const html=pages.get(offer.sourceUrl);
  if(!html) return offer;

  const result=verifyLeclercCatalogOffer(html,offer);
  if(!result.ok){
    console.warn(
      "[leclerc] non confirmé : "+offer.title+" · "+result.reasons.join(" | ")
    );
    return offer;
  }

  verified+=1;
  if(offer.verifiedAt===today) return offer;
  changed+=1;
  console.log("[leclerc] confirmé : "+offer.title);
  return {
    ...offer,
    verifiedAt:today
  };
});

console.log(
  "[leclerc] "+verified+"/"+offers.length+" offre(s) confirmée(s) ; "+
  failures.length+" page(s) inaccessible(s) ; "+changed+" mise(s) à jour."
);

if(write && changed>0){
  await writeFile(SNAPSHOT_URL,JSON.stringify(next,null,2)+"\n","utf8");
  console.log("[leclerc] snapshot mis à jour.");
}
