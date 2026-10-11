import { readFile,writeFile } from "node:fs/promises";
import { extractShopmiumOfferUrls,extractShopmiumLandingDetailUrls,isOfficialShopmiumOfferUrl,isShopmiumPubliclyClosed,mergeShopmiumOfferUrls,parseShopmiumDetailHtml } from "../src/adapters/shopmium.js";
import { isOfferActive,validateImportBatch } from "../src/ingestion.js";

const INDEX_URL="https://offers.shopmium.com/fr/";
const WATCHLIST_URL=new URL("../data/shopmium-watchlist.json",import.meta.url);
const OUTPUT_URL=new URL("../data/import/shopmium-auto.json",import.meta.url);
const MANIFEST_URL=new URL("../data/import/index.json",import.meta.url);
const write=process.argv.includes("--write");
const minOffers=Math.max(5,Number(process.env.MIN_SHOPMIUM_OFFERS||12));
const verifiedAt=new Date().toISOString().slice(0,10);
const now=new Date();

const indexResponse=await fetch(INDEX_URL,{
  headers:{Accept:"text/html,application/xhtml+xml","User-Agent":"PromoAlimentaire/0.1 public-offer-sync"},
  redirect:"follow",signal:AbortSignal.timeout(15000)
});
if(!indexResponse.ok) throw new Error("Shopmium index HTTP "+indexResponse.status);
const indexHtml=await indexResponse.text();
if(indexHtml.length<5000) throw new Error("Réponse Shopmium anormalement courte.");

const indexUrls=extractShopmiumOfferUrls(indexHtml);
const watchlist=JSON.parse(await readFile(WATCHLIST_URL,"utf8"));
if(!watchlist || !Array.isArray(watchlist.urls)){
  throw new Error("Liste de surveillance Shopmium malformée.");
}
const urls=mergeShopmiumOfferUrls(indexUrls,watchlist.urls);
if(indexUrls.length<minOffers){
  throw new Error("Découverte Shopmium insuffisante : "+indexUrls.length+" URL(s) dans l'index.");
}
console.log("[shopmium] "+indexUrls.length+" fiches index + "+watchlist.urls.length+
  " liens surveillés, soit "+urls.length+" fiches uniques à revalider.");

const parsed=[];
const discoveredDetails=new Set();
const publiclyClosedUrls=new Set();
const batchSize=8;
// Bounded public-page crawl: official offers index -> campaign landing page
// -> individual official terms, with no deeper traversal or guessed offers.
// A 401/403/429 is an access limit; stop instead of retrying or bypassing it.
const MAX_PAGES=110;
const primaryUrls=urls.slice(0,MAX_PAGES);
let accessDenied=false;
let fetched=0;
let unavailable=0;

async function inspectPages(candidates,{allowLandingDiscovery=false}={}){
  for(let start=0;start<candidates.length && !accessDenied;start+=batchSize){
    const batch=candidates.slice(start,start+batchSize);
    const results=await Promise.all(batch.map(async(url)=>{
      if(!isOfficialShopmiumOfferUrl(url)) return null;
      try{
        const response=await fetch(url,{
          headers:{Accept:"text/html,application/xhtml+xml",
            "User-Agent":"PromoAlimentaire/0.1 public-offer-sync"},
          redirect:"follow",signal:AbortSignal.timeout(12000)
        });
        if([401,403,429].includes(response.status)){
          accessDenied=true;
          return null;
        }
        if(!response.ok || !isOfficialShopmiumOfferUrl(response.url)){
          unavailable+=1;
          return null;
        }
        const html=await response.text();
        fetched+=1;
        if(isShopmiumPubliclyClosed(html)) publiclyClosedUrls.add(url);
        const offer=parseShopmiumDetailHtml(html,url,{verifiedAt});
        const children=allowLandingDiscovery && !offer
          ? extractShopmiumLandingDetailUrls(html,url) : [];
        return {offer,children};
      }catch{
        unavailable+=1;
        return null;
      }
    }));
    for(const result of results){
      if(!result) continue;
      if(result.offer) parsed.push(result.offer);
      for(const child of result.children) discoveredDetails.add(child);
    }
    // Keep requests modest even when the public index contains many cards.
    if(start+batchSize<candidates.length){
      await new Promise((resolve)=>setTimeout(resolve,150));
    }
  }
}

await inspectPages(primaryUrls,{allowLandingDiscovery:true});
const knownUrls=new Set(primaryUrls);
const childUrls=[...discoveredDetails].filter((url)=>!knownUrls.has(url))
  .slice(0,Math.max(0,MAX_PAGES-primaryUrls.length));
console.log("[shopmium] "+discoveredDetails.size+
  " liens de détail officiels trouvés dans les pages campagne ; "+
  childUrls.length+" fiche(s) supplémentaires à vérifier.");
await inspectPages(childUrls);
console.log("[shopmium] "+fetched+" page(s) officielles lues, "+
  unavailable+" indisponible(s), accès limité="+accessDenied+".");

const freshById=new Map(parsed.map((offer)=>[offer.externalId,offer]));
const fresh=[...freshById.values()].filter((offer)=>isOfferActive(offer,now));
if(accessDenied) throw new Error("Shopmium refuse ou limite les requêtes publiques (401/403/429) ; snapshot existant préservé sans prolonger les offres.");
if(fresh.length<minOffers){
  throw new Error("Extraction Shopmium active insuffisante : "+fresh.length+" offre(s), minimum "+minOffers+".");
}
// A temporary partial catalog must not erase an independently confirmed
// offer that remains within its original short review window. Its proof
// date is NEVER advanced unless the individual official detail was read.
const previous=JSON.parse(await readFile(OUTPUT_URL,"utf8"));
if(!Array.isArray(previous)) throw new Error("Ancien snapshot Shopmium invalide.");
const retained=previous.filter((offer)=>isOfferActive(offer,now)
  && !publiclyClosedUrls.has(offer.sourceUrl)
  && !freshById.has(offer.externalId));
const active=[...fresh,...retained];
const validation=validateImportBatch(active);
if(!validation.ok){
  const sample=validation.errors.slice(0,5).map((item)=>"index "+item.index+": "+item.errors.join(" | ")).join("\n");
  throw new Error("Snapshot Shopmium invalide : "+validation.errors.length+" erreur(s).\n"+sample);
}

console.log("[shopmium] "+fresh.length+" offres officielles reconfirmées ; "+
  retained.length+" anciennes encore dans leur propre fenêtre de révision ; "+
  validation.normalized.length+" actives validées.");
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
