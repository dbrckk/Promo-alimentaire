import { readFile,writeFile } from "node:fs/promises";
import { verifyCarrefourPromotionPage } from "../src/adapters/carrefour-promotions.js";

const SNAPSHOT_URL=new URL("../data/import/carrefour-promotions-auto.json",import.meta.url);
const write=process.argv.includes("--write");
const today=new Date().toISOString().slice(0,10);
const nextReview=addDays(today,2);

const offers=JSON.parse(await readFile(SNAPSHOT_URL,"utf8"));
if(!Array.isArray(offers)) throw new Error("Snapshot Carrefour invalide.");

let confirmed=0;
let changed=0;
let unavailable=0;
const next=[];

for(const offer of offers){
  try{
    const response=await fetch(offer.sourceUrl,{
      headers:{
        Accept:"text/html,application/xhtml+xml",
        "User-Agent":"PromoAlimentaire/0.1 public-carrefour-promo-verifier"
      },
      redirect:"follow",
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) throw new Error("HTTP "+response.status);
    const html=await response.text();
    if(html.length<1000) throw new Error("réponse anormalement courte");

    const result=verifyCarrefourPromotionPage(html,offer,{
      sourceUrl:response.url || offer.sourceUrl
    });
    if(!result.ok){
      console.warn(
        "[carrefour] non confirmée · "+offer.title+" · "+result.reasons.join(" | ")
      );
      next.push(offer);
      continue;
    }

    confirmed+=1;
    const refreshed={
      ...offer,
      verifiedAt:today,
      reviewAfter:nextReview
    };
    if(
      refreshed.verifiedAt!==offer.verifiedAt
      || refreshed.reviewAfter!==offer.reviewAfter
    ) changed+=1;
    next.push(refreshed);
    console.log("[carrefour] confirmée · "+offer.title);
  }catch(error){
    unavailable+=1;
    console.warn("[carrefour] indisponible · "+offer.title+" · "+error.message);
    next.push(offer);
  }
}

console.log(
  "[carrefour] confirmées="+confirmed+
  "/"+offers.length+
  " · indisponibles="+unavailable+
  " · mises à jour="+changed
);

if(write && changed>0){
  await writeFile(SNAPSHOT_URL,JSON.stringify(next,null,2)+"\n","utf8");
  console.log("[carrefour] snapshot rafraîchi.");
}

function addDays(iso,days){
  const date=new Date(iso+"T12:00:00Z");
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
