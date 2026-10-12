import { readFile,writeFile } from "node:fs/promises";
import { verifyLeclercCatalogOffer } from "../src/adapters/leclerc-catalog.js";
import {isOfferActive} from "../src/ingestion.js";
import {writeSourceSyncStatus} from "./source-sync-status.mjs";

const SNAPSHOT_URL=new URL("../data/import/leclerc-catalog-2026-10-07.json",import.meta.url);
const write=process.argv.includes("--write");
const today=new Date().toISOString().slice(0,10);

const offers=JSON.parse(await readFile(SNAPSHOT_URL,"utf8"));
if(!Array.isArray(offers)) throw new Error("Snapshot E.Leclerc invalide.");

// Catalogues from a finished campaign must not be queried again or have their
// verification date refreshed by a generic page left online.
const current=new Date();
const active=offers.filter((offer)=>isOfferActive(offer,current));
const skippedExpired=offers.length-active.length;
const pages=new Map();
const failures=[];
const deniedUrls=new Set();
const allowedCatalogUrl=(value)=>{
  try{
    const url=new URL(String(value));
    return url.protocol==="https:"
      && url.hostname==="nos-catalogues-promos-v2.e.leclerc"
      && /^\/catalog\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+(?:\/products)?\/?$/.test(url.pathname)
      && !url.username && !url.password;
  }catch{return false;}
};
const sources=[...new Set(active.map((offer)=>offer.sourceUrl).filter(Boolean))];
for(const url of sources){
  if(!allowedCatalogUrl(url)){
    failures.push({url,error:"URL catalogue hors domaine officiel autorisé"});
    continue;
  }
  try{
    const response=await fetch(url,{
      headers:{
        Accept:"text/html,application/xhtml+xml",
        "User-Agent":"PromoAlimentaire/0.1 public-leclerc-catalog-verifier"
      },
      redirect:"follow",
      signal:AbortSignal.timeout(15000)
    });
    if([401,403,429].includes(response.status)){
      deniedUrls.add(url);
      throw new Error("HTTP "+response.status+" : refus ou limite d'accès");
    }
    if(!response.ok) throw new Error("HTTP "+response.status);
    if(!allowedCatalogUrl(response.url)) throw new Error("Redirection hors catalogue officiel");
    const html=await response.text();
    if(html.length<500) throw new Error("réponse anormalement courte");
    pages.set(url,html);
    console.log("[leclerc] page HTML publique récupérée : "+url);
  }catch(error){
    failures.push({url,error:error.message});
    console.warn("[leclerc] page indisponible : "+url+" · "+error.message);
  }
}

// Proof is per OFFER, not per generic catalogue page. A product name on
// page A and a discount on page B must never become a verified promotion.
const confirmations=new Map();
let verifiedRaw=0;
let verifiedRendered=0;
for(const offer of active){
  const html=pages.get(offer.sourceUrl);
  if(!html) continue;
  const result=verifyLeclercCatalogOffer(html,offer,{requireNearbyEvidence:true});
  if(result.ok){
    confirmations.set(offer.externalId,result);
    verifiedRaw++;
    console.log("[leclerc] HTML confirme · "+offer.title);
  }
}

// The official E.Leclerc magazine renders much of the actual product
// content with JavaScript. Only fall back to an ordinary unauthenticated
// public browser when the GET succeeds, but the static HTML is a shell.
// Never use browser mode to bypass a 401/403/429, login or challenge.
const pendingUrls=[...new Set(active
  .filter((offer)=>!confirmations.has(offer.externalId))
  .map((offer)=>offer.sourceUrl)
  .filter((url)=>pages.has(url) && !deniedUrls.has(url)))].slice(0,8);
if(pendingUrls.length){
  let browser=null;
  try{
    const {chromium}=await import("playwright");
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({locale:"fr-FR"});
    for(const url of pendingUrls){
      const page=await context.newPage();
      try{
        const response=await page.goto(url,{
          waitUntil:"domcontentloaded",timeout:20000
        });
        if(!response || [401,403,429].includes(response.status())
          || !response.ok() || !allowedCatalogUrl(page.url())){
          console.warn("[leclerc] rendu refusé / redirection : "+url);
          continue;
        }
        // Only what a real user sees in the public catalogue counts.
        // No private fetch endpoints, login or interception.
        await page.waitForLoadState("networkidle",{timeout:5500}).catch(()=>{});
        const publicText=await page.locator("body").innerText({timeout:8500});
        if(publicText.length<400 || /captcha|v[ée]rifiez que vous [êe]tes humain|access denied/i.test(publicText)){
          console.warn("[leclerc] rendu public non exploitable : "+url);
          continue;
        }
        let confirmedHere=0;
        for(const offer of active.filter((item)=>
          item.sourceUrl===url && !confirmations.has(item.externalId))){
          const result=verifyLeclercCatalogOffer(publicText,offer,{requireNearbyEvidence:true});
          if(!result.ok) continue;
          confirmations.set(offer.externalId,result);
          verifiedRendered++;
          confirmedHere++;
          console.log("[leclerc] rendu visible confirme · "+offer.title);
        }
        console.log("[leclerc] catalogue public visible : "+url+
          " · "+confirmedHere+" campagne(s) retrouvée(s)");
      }catch(error){
        console.warn("[leclerc] affichage public indisponible : "+url+
          " · "+String(error?.message || error).slice(0,130));
      }finally{
        await page.close();
      }
    }
    await context.close();
  }catch(error){
    console.warn("[leclerc] Chromium public non disponible : "+
      String(error?.message || error).slice(0,150));
  }finally{
    if(browser) await browser.close();
  }
}

let verified=0;
let changed=0;
const next=offers.map((offer)=>{
  if(!isOfferActive(offer,current)) return offer;
  if(!confirmations.has(offer.externalId)) {
    console.warn("[leclerc] non reconfirmée : "+offer.title);
    return offer;
  }
  verified++;
  if(offer.verifiedAt===today) return offer;
  changed++;
  return {...offer,verifiedAt:today};
});

console.log(
  "[leclerc] "+verified+"/"+offers.length+" offre(s) confirmée(s) ; "+
  failures.length+" page(s) inaccessible(s) ; "+
  verifiedRaw+" confirmé(s) par HTML + "+verifiedRendered+" par navigateur ; "+
  skippedExpired+" campagne(s) expirée(s) ignorée(s) ; "+changed+" mise(s) à jour."
);

if(write && changed>0){
  await writeFile(SNAPSHOT_URL,JSON.stringify(next,null,2)+"\n","utf8");
  console.log("[leclerc] snapshot mis à jour.");
}
await writeSourceSyncStatus("leclerc",{
  status:active.length>0 && verified===active.length?"updated"
    : verified===0?"unavailable":"partial",
  reason:active.length===0
    ? "Aucune campagne catalogue encore en cours ("+skippedExpired+" expirée(s)). Il faut découvrir les nouvelles opérations."
    : verified===active.length
      ? "Toutes les promotions encore dans leur période ont été reconfirmées (HTML="+verifiedRaw+", rendu public="+verifiedRendered+")."
      : verified===0 && pages.size>0
        ? "Pages catalogue accessibles, mais aucune preuve produit/remise retrouvée même après rendu navigateur public. Vérification manuelle ou flux officiel nécessaire."
        : verified===0
          ? "Pages catalogue inaccessibles : "+failures.length+" échec(s) HTTP/réseau ; aucune offre reconfirmée."
          : "Seulement "+verified+"/"+active.length+" campagne(s) encore valides reconfirmée(s).",
  extractedCount:verified,
  previousSnapshotCount:offers.length,
  // A verified batch may be partial without invalidating the nine
  // individual campaign titles/rates already confirmed by the public page.
  // The PWA can then warn only for the unresolved externalId(s).
  confirmedExternalIds:[...confirmations.keys()]
},{write});
