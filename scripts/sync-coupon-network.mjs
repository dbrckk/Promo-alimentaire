import { readFile, writeFile, appendFile } from "node:fs/promises";
import {
  parseCouponNetworkHtml, assessCouponNetworkSnapshot
} from "../src/adapters/coupon-network.js";
import { validateImportBatch } from "../src/ingestion.js";

const SOURCE_URLS=[
  "https://www.couponnetwork.fr/",
  "https://www.couponnetwork.fr/index.rss"
];
const OUTPUT_URL=new URL("../data/import/coupon-network-auto.json",import.meta.url);
const MANIFEST_URL=new URL("../data/import/index.json",import.meta.url);
const STATUS_URL=new URL("../data/import/source-sync-status.json",import.meta.url);
const write=process.argv.includes("--write");
const minOffers=Math.max(10,Number(process.env.MIN_COUPON_NETWORK_OFFERS) || 20);
const strictSource=process.argv.includes("--strict-source");
const verifiedAt=new Date().toISOString().slice(0,10);
const previous=JSON.parse(await readFile(OUTPUT_URL,"utf8"));
if(!Array.isArray(previous)) throw new Error("Snapshot Coupon Network précédent invalide.");
const previousCount=previous.length;

async function recordSyncStatus(status,reason,count){
  if(!write) return;
  const state=JSON.parse(await readFile(STATUS_URL,"utf8"));
  if(!state.sources || typeof state.sources!=="object") state.sources={};
  state.sources["coupon-network"]={
    status,
    checkedAt:new Date().toISOString(),
    reason:String(reason||"").slice(0,220),
    extractedCount:count,
    previousSnapshotCount:previousCount
  };
  await writeFile(STATUS_URL,JSON.stringify(state,null,2)+"\n","utf8");
}

async function sourceUnavailable(reason){
  await recordSyncStatus("unavailable",reason,0);
  const message="Aucune revalidation : "+reason+
    ". Snapshot précédent conservé sans modifier verifiedAt/reviewAfter ("+
    previousCount+" offres antérieures). L'application les masquera après leur date limite.";
  console.warn("[coupon-network] "+message);
  console.log("::warning title=Coupon Network non réactualisé::"+message);
  if(process.env.GITHUB_STEP_SUMMARY){
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      "\n### Coupon Network : source non réactualisée\n"+
      "- **Résultat :** "+String(reason).replace(/[|\r\n]/g," ")+"\n"+
      "- **Offres précédentes :** "+previousCount+" (dates inchangées)\n"+
      "- **Aucune offre publiée ou prolongée.** Les offres expirées sont exclues automatiquement.\n",
      "utf8"
    );
  }
  if(strictSource) process.exitCode=1;
}

const pages=[];
for(const sourceUrl of SOURCE_URLS){
  try{
    const response=await fetch(sourceUrl,{
      headers:{
        Accept:"text/html,application/xhtml+xml",
        "User-Agent":"PromoAlimentaire/0.1 public-offer-sync"
      },
      redirect:"follow",
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) throw new Error("HTTP "+response.status);
    const html=await response.text();
    if(html.length<5000) throw new Error("réponse anormalement courte");
    const parsed=parseCouponNetworkHtml(html,{verifiedAt});
    console.log("[coupon-network] "+sourceUrl+" -> "+parsed.length+" offre(s) via liste publique.");
    pages.push({sourceUrl,html,parsed});
  }catch(error){
    console.warn("[coupon-network] "+sourceUrl+" indisponible: "+error.message);
  }
}
if(!pages.length){
  await sourceUnavailable("Aucune page publique exploitable");
  process.exit();
}

pages.sort((a,b)=>b.parsed.length-a.parsed.length);
let offers=pages[0].parsed;
if(offers.length<minOffers){
  const { extractCouponNetworkDetailUrls, parseCouponNetworkDetailHtml } = await import("../src/adapters/coupon-network.js");
  const urls=[...new Set(pages.flatMap((page)=>extractCouponNetworkDetailUrls(page.html)))];
  console.log("[coupon-network] listes directes insuffisantes ("+offers.length+"), bascule sur "+urls.length+" fiches publiques uniques.");
  const details=[];
  const batchSize=10;
  for(let start=0;start<urls.length;start+=batchSize){
    const batch=urls.slice(start,start+batchSize);
    const results=await Promise.all(batch.map(async(url)=>{
      try{
        const detailResponse=await fetch(url,{
          headers:{Accept:"text/html,application/xhtml+xml","User-Agent":"PromoAlimentaire/0.1 public-offer-sync"},
          redirect:"follow",
          signal:AbortSignal.timeout(12000)
        });
        if(!detailResponse.ok) return null;
        const detailHtml=await detailResponse.text();
        return parseCouponNetworkDetailHtml(detailHtml,url,{verifiedAt});
      }catch{
        return null;
      }
    }));
    details.push(...results.filter(Boolean));
    await new Promise((resolve)=>setTimeout(resolve,80));
  }
  const unique=new Map(details.map((offer)=>[offer.externalId,offer]));
  offers=[...unique.values()];
}
const assessment=assessCouponNetworkSnapshot(offers,{
  previousCount,minimum:minOffers
});
if(!assessment.publish){
  await sourceUnavailable(
    assessment.reason+" ("+assessment.count+"/"+minOffers+" minimum, "+
    previousCount+" auparavant)"
  );
  process.exit();
}

const validation=validateImportBatch(offers);
if(!validation.ok){
  const sample=validation.errors.slice(0,5).map((item)=>
    "index "+item.index+": "+item.errors.join(" | ")
  ).join(" / ");
  await sourceUnavailable("Nouveau snapshot invalide ("+
    validation.errors.length+" erreurs) : "+sample);
  process.exit();
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
  await recordSyncStatus("updated","Données publiques extraites et validées",offers.length);
  if(process.env.GITHUB_STEP_SUMMARY){
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      "\n### Coupon Network : actualisation validée\n"+
      "- **"+offers.length+" offres** vérifiées par extraction publique.\n"+
      "- Aucun EAN ni cumul n'est garanti sans preuve supplémentaire.\n",
      "utf8"
    );
  }
}else{
  console.log("[coupon-network] dry-run : aucun fichier modifié.");
}
