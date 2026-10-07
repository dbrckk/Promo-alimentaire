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
let clientBundleProbed=false;
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
    if(offers.length===0){
      const lower=html.toLocaleLowerCase("fr");
      const probes=["rembours","le chat","x.tra","drupalsettings","/api/","ajax","graphql","__next_data__"];
      for(const probe of probes){
        const index=lower.indexOf(probe.toLocaleLowerCase("fr"));
        console.log("[la-belle-adresse][probe] "+probe+" -> "+index);
        if(index>=0) console.log("[la-belle-adresse][snippet] "+html.slice(Math.max(0,index-220),index+520).replace(/\s+/g," ").slice(0,740));
      }
      const scripts=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map((match)=>match[1]).slice(0,25);
      console.log("[la-belle-adresse][scripts] "+JSON.stringify(scripts));
      if(!clientBundleProbed){
        clientBundleProbed=true;
        await probeClientBundles(url,scripts);
      }
    }
    found.push(...offers);
  }catch(error){
    console.warn("[la-belle-adresse] "+url+" indisponible: "+error.message);
  }
}

const unique=new Map(found.map((offer)=>[offer.externalId,offer]));
const offers=[...unique.values()];
if(offers.length<minOffers){
  await probePublicCashbackApi();
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


async function probeClientBundles(pageUrl,scripts){
  for(const src of scripts){
    let bundleUrl;
    try{ bundleUrl=new URL(src,pageUrl); }catch{ continue; }
    if(bundleUrl.hostname!=="www.labelleadresse.com") continue;
    try{
      const response=await fetch(bundleUrl,{
        headers:{Accept:"application/javascript,text/javascript,*/*","User-Agent":"PromoAlimentaire/0.1 public-offer-sync"},
        signal:AbortSignal.timeout(15000)
      });
      if(!response.ok) continue;
      const js=await response.text();
      console.log("[la-belle-adresse][bundle] "+bundleUrl.pathname+" · "+js.length+" chars");
      const needles=["/api/","api/","remboursement","cashback","offer","offers","reduction","economies","axios","fetch("];
      for(const needle of needles){
        let offset=0,count=0;
        const lower=js.toLocaleLowerCase("fr");
        while(count<4){
          const index=lower.indexOf(needle.toLocaleLowerCase("fr"),offset);
          if(index<0) break;
          const snippet=js.slice(Math.max(0,index-220),Math.min(js.length,index+520)).replace(/\s+/g," ");
          console.log("[la-belle-adresse][bundle:"+needle+"] "+snippet.slice(0,740));
          offset=index+needle.length;
          count+=1;
        }
      }
      const absolute=[...js.matchAll(/https?:\\?\/\\?\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%\\-]+/g)]
        .map((match)=>match[0].replace(/\\\//g,"/"))
        .filter((value)=>/labelleadresse|api|henkel|offer|cashback|reduc/i.test(value))
        .slice(0,30);
      console.log("[la-belle-adresse][bundle-urls] "+JSON.stringify([...new Set(absolute)]));
    }catch(error){
      console.warn("[la-belle-adresse][bundle] "+bundleUrl+" : "+error.message);
    }
  }
}


async function probePublicCashbackApi(){
  const candidates=[
    "https://back.labelleadresse.com/api/lba-cashback/filter/",
    "https://back.labelleadresse.com/api/lba-cashback/filter",
    "https://back.labelleadresse.com/api/lba-cashback/",
    "https://back.labelleadresse.com/api/lba-cashback",
    "https://back.labelleadresse.com/api/lba-cashback/filter/?filter=brand",
    "https://back.labelleadresse.com/api/lba-cashback/filter/?filter=univers"
  ];
  for(const url of candidates){
    try{
      const response=await fetch(url,{
        headers:{
          Accept:"application/json,text/plain,*/*",
          Referer:"https://www.labelleadresse.com/",
          Origin:"https://www.labelleadresse.com",
          "User-Agent":"PromoAlimentaire/0.1 public-offer-sync"
        },
        redirect:"follow",
        signal:AbortSignal.timeout(12000)
      });
      const text=await response.text();
      console.log("[la-belle-adresse][api] "+url+" -> "+response.status+" "+(response.headers.get("content-type")||"")+" · "+text.length+" chars");
      console.log("[la-belle-adresse][api-body] "+text.slice(0,1800).replace(/\s+/g," "));
    }catch(error){
      console.warn("[la-belle-adresse][api] "+url+" -> "+error.message);
    }
  }
}
