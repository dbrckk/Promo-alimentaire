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

const offers=parseCouponNetworkHtml(html,{verifiedAt});
if(offers.length<minOffers){
  const detailLinks=(html.match(/autres-enseignes-cashback-coupons[^"'<>\s]+\/\d+/gi)||[]);
  const couponIds=(html.match(/coupon\/\d+/gi)||[]);
  const refundMarkers=(html.match(/REMBOURS/gi)||[]);
  console.error("[coupon-network] diagnostic raw HTML:",{
    length:html.length,
    detailLinks:detailLinks.length,
    couponIds:couponIds.length,
    refundMarkers:refundMarkers.length,
    contentType:response.headers.get("content-type")
  });
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
