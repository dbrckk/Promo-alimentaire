import { readFile,writeFile } from "node:fs/promises";
import {
  fetchOpenFoodFactsCandidates,
  selectUniqueEanCandidate
} from "../src/ean-resolver.js";

const SNAPSHOT_URL=new URL("../data/import/leclerc-catalog-2026-10-07.json",import.meta.url);
const write=process.argv.includes("--write");
const offers=JSON.parse(await readFile(SNAPSHOT_URL,"utf8"));
if(!Array.isArray(offers)) throw new Error("Snapshot E.Leclerc invalide.");

let searched=0;
let enriched=0;
let ambiguous=0;
let none=0;
const next=[];

for(const offer of offers){
  if(Array.isArray(offer.eans) && offer.eans.length){
    next.push(offer);
    continue;
  }
  if(offer.eanResolutionBlocked===true){
    console.log(
      "[ean] bloquée · "+offer.title+
      " · "+(offer.eanResolutionReason || "résolution automatique désactivée")
    );
    next.push(offer);
    continue;
  }
  if(!offer.productMatch){
    next.push(offer);
    continue;
  }

  if(searched>0) await sleep(11000);
  searched+=1;

  try{
    const {terms,candidates}=await fetchOpenFoodFactsCandidates(offer,{
      pageSize:20,
      maxRetries:2,
      retryBaseMs:10000
    });
    const resolution=selectUniqueEanCandidate(offer,candidates,{
      minScore:80,
      minMargin:12
    });

    if(resolution.status!=="unique"){
      if(resolution.status==="ambiguous") ambiguous+=1;
      else none+=1;
      console.log(
        "[ean] "+resolution.status+" · "+offer.title+
        " · recherche="+terms+
        " · candidats="+resolution.ranked.length
      );
      next.push(offer);
      continue;
    }

    const product=resolution.candidate;
    enriched+=1;
    console.log(
      "[ean] unique · "+offer.title+
      " · "+product.code+
      " · "+product.brands+" · "+product.product_name+
      " · score="+resolution.score+
      " · marge="+resolution.margin
    );
    next.push({
      ...offer,
      eans:[product.code],
      eanEvidenceUrl:"https://world.openfoodfacts.org/product/"+product.code,
      eanResolution:{
        source:"Open Food Facts",
        resolvedAt:new Date().toISOString().slice(0,10),
        score:resolution.score,
        margin:resolution.margin,
        productName:product.product_name || "",
        brands:product.brands || "",
        quantity:product.quantity || ""
      }
    });
  }catch(error){
    console.warn("[ean] erreur · "+offer.title+" · "+error.message);
    next.push(offer);
  }
}

console.log(
  "[ean] recherches="+searched+
  " · enrichies="+enriched+
  " · ambiguës="+ambiguous+
  " · sans résultat="+none
);

if(write && enriched>0){
  await writeFile(SNAPSHOT_URL,JSON.stringify(next,null,2)+"\n","utf8");
  console.log("[ean] snapshot enrichi.");
}

function sleep(ms){
  return new Promise((resolve)=>setTimeout(resolve,ms));
}
