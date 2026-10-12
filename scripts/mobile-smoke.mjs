import assert from "node:assert/strict";
import {mkdir,readFile} from "node:fs/promises";
import {chromium,devices} from "playwright";

const RECENT_RECEIPT_DATE=new Date(Date.now()-24*60*60*1000)
  .toISOString().slice(0,10); // fresh regardless of when GitHub Actions runs
const BASE=process.env.SMOKE_URL || "http://127.0.0.1:4173/";
const OUT=process.env.SMOKE_OUTPUT || "artifacts/mobile";
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({
  ...devices["Pixel 7"],
  locale:"fr-FR",
  timezoneId:"Europe/Paris",
  serviceWorkers:"allow",
  acceptDownloads:true,
  permissions:[]
});
const page=await context.newPage();
const jsErrors=[];
const failedLocal=[];
page.on("pageerror",(error)=>jsErrors.push(error.stack || error.message));
page.on("response",(response)=>{
  if(response.url().startsWith(BASE) && response.status()>=400){
    failedLocal.push(response.status()+" "+response.url());
  }
});

await page.route("https://world.openfoodfacts.org/**",(route)=>{
  route.fulfill({
    status:200,contentType:"application/json",
    body:JSON.stringify({product:{
      code:"3017624010701",product_name:"Pâte à tartiner témoin",
      brands:"Marque test",quantity:"350 g",
      categories_tags:["en:spreads"]
    }})
  });
});
await page.route("https://prices.openfoodfacts.org/**",(route)=>{
  const code=new URL(route.request().url()).searchParams.get("product_code");
  route.fulfill({
    status:200,contentType:"application/json",
    body:JSON.stringify({total:2,items:[
      {id:1,product_code:code,price:3.49,currency:"EUR",date:RECENT_RECEIPT_DATE,
        location_id:42,location:{id:42,osm_brand:"Carrefour",
        osm_name:"Carrefour Lyon",osm_lat:45.760,osm_lon:4.84,
        osm_address_postcode:"69002",osm_address_city:"Lyon"}},
      {id:2,product_code:code,price:3.59,currency:"EUR",date:RECENT_RECEIPT_DATE,
        location_id:99,location:{id:99,osm_brand:"E.Leclerc",
        osm_name:"E.Leclerc Lyon",osm_lat:45.761,osm_lon:4.85,
        osm_address_postcode:"69003",osm_address_city:"Lyon"}}
    ]})
  });
});

try{
  const response=await page.goto(BASE,{waitUntil:"networkidle",timeout:30000});
  assert.equal(response.status(),200);
  await page.locator("#stats .stat").first().waitFor({timeout:10000});
  assert.match(await page.title(),/Promo Alimentaire/);
  await page.waitForFunction(()=>
    document.querySelector("#datasetDate")?.textContent?.includes("offre(s) importée(s) active(s)"),
    null,{timeout:12000}
  );
  // Public catalogue JSON can claim autoStackWhenEligible=true despite
  // lacking proof. A loyalty-card selection must not turn such a product
  // or basket rule into an immediate/guaranteed deduction. A separately
  // traceable gift-card saving should continue to work normally.
  const importedLoyaltySafety=await page.evaluate(async()=>{
    const {normalizeImportedOffer}=await import("./src/ingestion.js");
    const {resolveOffersForLoyalty}=await import("./src/loyalty.js");
    const {optimizeStack}=await import("./src/stacking.js");
    const {evaluateBasketStore}=await import("./src/basket.js");
    const malicious=(scope,eans=[])=>{
      const value=normalizeImportedOffer({
        providerId:"leclerc",externalId:"unverified-"+scope,
        title:"Avantage inventé de 90%",scope,stores:["leclerc"],
        sourceUrl:"https://www.e.leclerc/",
        verifiedAt:"2026-10-11",reviewAfter:"2026-10-18",
        savingPercent:90,requiresLoyalty:"leclerc-card",
        autoStack:true,autoStackWhenEligible:true,
        eans,eanEvidenceUrl:eans.length
          ?"https://www.e.leclerc/fp/produit-3017624010701":undefined
      });
      if(!value.ok) throw new Error(value.errors.join(" | "));
      return value.value;
    };
    const product=malicious("produit",["3017624010701"]);
    const basketOffer=malicious("panier");
    const resolved=resolveOffersForLoyalty(
      [product,basketOffer],{leclerc:"card"}
    );
    const productScenario=evaluateBasketStore(
      [{
        product:{code:"3017624010701",name:"Produit témoin",
          brands:"Marque",categories:[]},
        quantity:1
      }],{
        store:"leclerc",channel:"store",
        priceByCode:{"3017624010701":[{
          price:20,date:"2026-10-11",storeName:"E.Leclerc",
          retailerText:"E.Leclerc"
        }]},
        offers:[product],loyaltyProfile:{leclerc:"card"},
        now:new Date("2026-10-11T12:00:00Z")
      }
    );
    const trusted=normalizeImportedOffer({
      providerId:"fidme-courses",externalId:"trusted-gift",
      title:"Bon Carrefour",scope:"panier",stores:["carrefour"],
      channels:["store"],mechanism:"gift_card",
      stackGroup:"payment-discount",savingPercent:4,
      autoStack:true,sourceUrl:"https://www.fidme.com/nos-avantages/bons-dachats/",
      verifiedAt:"2026-10-11",reviewAfter:"2026-10-18"
    });
    if(!trusted.ok) throw new Error(trusted.errors.join(" | "));
    return {
      importedFlags:[product.autoStack,product.autoStackWhenEligible,
        basketOffer.autoStack,basketOffer.autoStackWhenEligible],
      afterCard:resolved.map((offer)=>offer.autoStack),
      basketFalseSaving:optimizeStack(20,resolved,{store:"leclerc",channel:"store"}).totalSaving,
      productFalseSaving:productScenario.guaranteedSaving,
      productCheckout:productScenario.checkoutCost,
      trustedAuto:trusted.value.autoStack,
      trustedSaving:optimizeStack(20,[trusted.value],{
        store:"carrefour",channel:"store"
      }).totalSaving
    };
  });
  assert.deepEqual(importedLoyaltySafety,{
    importedFlags:[false,false,false,false],
    afterCard:[false,false],basketFalseSaving:0,
    productFalseSaving:0,productCheckout:20,
    trustedAuto:true,trustedSaving:0.8
  });

  // Browser-level end-to-end contract for public campaign landing pages:
  // a hub is discovery only, never an invented rebate. Its individual
  // official detail has real tiers, merchant coverage and explicit brand.
  const shopmiumHubJourney=await page.evaluate(async()=>{
    const {extractShopmiumLandingDetailUrls,parseShopmiumDetailHtml}=
      await import("./src/adapters/shopmium.js");
    const {validateImportBatch}=await import("./src/ingestion.js");
    const hub=`<title>Shopmium | Salades Bonduelle</title>
      <a href="/fr/n/carotte-citron-de-sicile-bonduelle">Carottes</a>
      <a href="/fr/n/taboule-bonduelle">Taboulé</a>
      <a href="https://untrusted.example/fr/n/fake">Hors site</a>
      <p>Découvrir ces offres</p>`;
    const children=extractShopmiumLandingDetailUrls(hub,
      "https://offers.shopmium.com/fr/n/salades-traiteur-a-domicile-bonduelle");
    const details=`<title>Shopmium | Carotte râpée Citron Bonduelle</title>
      <h1>Carotte râpée Citron Bonduelle</h1>
      <p>1 article acheté = -25%</p>
      <p>2 articles achetés = -30%</p>
      <p>3 articles achetés = -34%</p>
      <p>Valable entre le 31/08/2026 à partir de 08:00 et le 30/12/2026
        jusqu'à 23:59 dans toute enseigne vendante (Drive inclus).</p>
      <p>Référence(s) éligible(s) et prix généralement constaté(s) :</p>
      <p>- Carotte Citron de Sicile 320g (1,48€)</p>
      <p>- Carotte Citron de Sicile 500g (2,30€)</p>
      <p>Remboursement maximum calculé par article</p>
      <p>Cette offre vous est proposée par : Bonduelle</p>`;
    const offer=parseShopmiumDetailHtml(details,children[0],{
      verifiedAt:"2026-10-11"
    });
    return {
      childCount:children.length,allOfficial:children.every((url)=>
        url.startsWith("https://offers.shopmium.com/fr/n/")),
      brand:offer?.productMatch?.brands?.[0]||null,
      savingPercent:offer?.savingPercent||null,
      tierCount:offer?.quantityTiers?.length||0,
      channels:offer?.channels||null,
      autoStack:offer?.autoStack,
      importValid:validateImportBatch([offer]).ok
    };
  });
  assert.deepEqual(shopmiumHubJourney,{
    childCount:2,allOfficial:true,brand:"Bonduelle",
    savingPercent:34,tierCount:3,channels:["store","drive"],
    autoStack:false,importValid:true
  });
  // Android browser: food-first rule applies to the actual published
  // Shopmium import, not only to isolated fixture records.
  const foodFirstScope=await page.evaluate(async()=>{
    const {filterOffers,isOfferWithinShoppingScope,effectivePercent}
      =await import("./src/domain.js");
    const {classifyShopmiumRayon}=await import("./src/adapters/shopmium.js");
    const response=await fetch("./data/import/shopmium-auto.json");
    const source=await response.json();
    const result=filterOffers(source,{store:"carrefour",channel:"store"});
    const forbidden=source.filter((x)=>x.category==="non-alimentaire"
      && (!Number.isFinite(effectivePercent(x)) || effectivePercent(x)<50));
    const forbiddenIds=new Set(forbidden.map((x)=>x.externalId));
    const sample={title:"Test",provider:"Test",stores:["all"]};
    return {
      rayonDouche:classifyShopmiumRayon("<p>Au rayon Douche</p>"),
      rayonBoisson:classifyShopmiumRayon("<p>Au rayon Boissons pour enfants</p>"),
      rayonMenager:classifyShopmiumRayon("<p>Au rayon Produits ménagers</p>"),
      rayonCafe:classifyShopmiumRayon("<p>Au rayon cafés capsules</p>"),
      rayonFrais:classifyShopmiumRayon("<p>A retrouver au rayon frais</p>"),
      rayonFromage:classifyShopmiumRayon(
        "<p>Valable en Drive & livraison. Au rayon Fromage.</p>"
      ),
      officialCoffeeFood:source.find((x)=>x.sourceUrl?.endsWith(
        "/cafes-legal-capsules-compatibles-nespresso"))?.category,
      officialAjaxNonfood:source.find((x)=>x.sourceUrl?.endsWith(
        "/ajax-power-mousse"))?.category,
      noAjax:!result.some((x)=>x.sourceUrl?.endsWith("/ajax-power-mousse")),
      noLeak:result.every((x)=>!forbiddenIds.has(x.externalId)),
      syntheticFood:isOfferWithinShoppingScope({
        ...sample,category:"alimentaire",savingPercent:10
      }),
      syntheticLowNonFood:isOfferWithinShoppingScope({
        ...sample,category:"non-alimentaire",savingPercent:40
      }),
      syntheticHighNonFood:isOfferWithinShoppingScope({
        ...sample,category:"non-alimentaire",savingPercent:55
      })
    };
  });
  assert.deepEqual(foodFirstScope,{
    rayonDouche:"non-alimentaire",rayonBoisson:"alimentaire",
    rayonMenager:"non-alimentaire",rayonCafe:"alimentaire",
    rayonFrais:"alimentaire",rayonFromage:"alimentaire",
    officialCoffeeFood:"alimentaire",officialAjaxNonfood:"non-alimentaire",
    noAjax:true,noLeak:true,syntheticFood:true,
    syntheticLowNonFood:false,syntheticHighNonFood:true
  });
  // A manipulated public JSON manifest cannot make the installed
  // application fetch data outside /data/import, including cross-origin URLs.
  const manifestProtection=await page.evaluate(async()=>{
    const {inspectImportManifest}=await import("./src/import-manifest.js");
    const {loadImportedOffers}=await import("./src/import-loader.js");
    let requests=0;
    const fetchImpl=async()=>{
      requests+=1;
      return {ok:true,json:async()=>({files:["../private.json","safe.json"]})};
    };
    let rejected=false;
    try{
      await loadImportedOffers({fetchImpl});
    }catch(error){
      rejected=/Manifeste d'offres refusé/.test(error.message);
    }
    return {
      safe:inspectImportManifest({files:["shopmium-auto.json"]}).ok,
      traversal:inspectImportManifest({files:["../secret.json"]}).ok,
      duplicate:inspectImportManifest({files:["a.json","a.json"]}).ok,
      oversized:inspectImportManifest({files:Array.from({length:61},(_,i)=>"s-"+i+".json")}).ok,
      rejected,requests
    };
  });
  assert.deepEqual(manifestProtection,{
    safe:true,traversal:false,duplicate:false,oversized:false,
    rejected:true,requests:1
  });
  // Check source downloads use a bounded pool and remain deterministic
  // on slow Android connections. One failed file must not discard the rest.
  const importPoolSafety=await page.evaluate(async()=>{
    const {loadImportedOffers}=await import("./src/import-loader.js");
    const names=["a.json","b.json","c.json","d.json"];
    const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
    let inFlight=0,maxInFlight=0;
    const downloaded=[];
    const fetchImpl=async(url,options)=>{
      const file=String(url).split("/").at(-1);
      if(file==="index.json"){
        return {ok:true,json:async()=>({files:names})};
      }
      if(file.startsWith("source-sync-")) return {ok:false,status:404};
      inFlight+=1;
      maxInFlight=Math.max(maxInFlight,inFlight);
      downloaded.push(file);
      await delay(file==="a.json"?45:10);
      inFlight-=1;
      if(file==="b.json") return {ok:false,status:503};
      return {ok:true,json:async()=>[{
        providerId:"shopmium",externalId:file,title:"Test "+file,
        stores:["all"],savingPercent:25,
        verifiedAt:"2026-10-11",reviewAfter:"2026-10-20",
        sourceUrl:"https://offers.shopmium.com/fr/"
      }]};
    };
    const result=await loadImportedOffers({
      fetchImpl,now:new Date("2026-10-12T12:00:00Z")
    });
    return {
      maxInFlight,
      downloaded:downloaded.length,
      ordered:result.sourceStats.map((x)=>x.file),
      active:result.offers.map((x)=>x.externalId),
      failed:result.errors.length
    };
  });
  assert.deepEqual(importPoolSafety.ordered,["a.json","b.json","c.json","d.json"]);
  assert.deepEqual(importPoolSafety.active,["a.json","c.json","d.json"]);
  assert.equal(importPoolSafety.failed,1);
  assert.equal(importPoolSafety.downloaded,4);
  assert.ok(importPoolSafety.maxInFlight>=2 && importPoolSafety.maxInFlight<=3);
  const importedEvidence=await page.evaluate(async()=>{
    const {loadImportedOffers}=await import("./src/import-loader.js");
    const result=await loadImportedOffers();
    const latest=result.offers.map((offer)=>offer.verifiedAt).filter(Boolean)
      .sort((a,b)=>new Date(a)-new Date(b)).at(-1) || null;
    return {count:result.offers.length,latest};
  });
  const footer=await page.locator("#datasetDate").innerText();
  assert.match(footer,/Catalogue de référence : 07\/10\/2026/);
  assert.ok(footer.includes(importedEvidence.count+" offre(s) importée(s) active(s)"));
  assert.doesNotMatch(footer,/Offres vérifiées :/);
  if(importedEvidence.latest){
    const expected=new Date(importedEvidence.latest).toLocaleDateString("fr-FR");
    assert.ok(footer.includes("Dernière preuve d'offre active : "+expected));
  }else{
    assert.doesNotMatch(footer,/Dernière preuve d'offre active/);
  }
  // Check the actual ingestion module inside Chrome Android rather than
  // accepting impossible or future source timestamps as savings evidence.
  const importDateSafety=await page.evaluate(async()=>{
    const {normalizeImportedOffer,isOfferActive}=await import("./src/ingestion.js");
    const sample={providerId:"coupon-network",externalId:"food-date-proof",
      title:"Offre alimentaire datée",stores:["all"],savingPercent:50,
      sourceUrl:"https://www.couponnetwork.fr/"};
    const valid=(fields)=>normalizeImportedOffer({...sample,...fields}).ok;
    const current=normalizeImportedOffer({...sample,
      verifiedAt:"2026-10-11",reviewAfter:"2026-10-15"}).value;
    const future=normalizeImportedOffer({...sample,
      verifiedAt:"2026-10-12",reviewAfter:"2026-10-15"}).value;
    const onDay=new Date("2026-10-11T12:00:00Z");
    return {
      impossibleVerified:valid({verifiedAt:"2026-02-30"}),
      malformedVerified:valid({verifiedAt:"2026-10-11x"}),
      impossibleReview:valid({verifiedAt:"2026-10-11",reviewAfter:"2026-02-30"}),
      impossibleExpiry:valid({verifiedAt:"2026-10-11",expiresAt:"2026-04-31"}),
      legitimateOffset:valid({verifiedAt:"2026-10-11",
        startsAt:"2026-10-11T08:00:00+02:00"}),
      currentActive:isOfferActive(current,onDay),
      futureActive:isOfferActive(future,onDay),
      tamperedActive:isOfferActive({...current,verifiedAt:"2026-02-30"},onDay)
    };
  });
  assert.deepEqual(importDateSafety,{
    impossibleVerified:false,malformedVerified:false,impossibleReview:false,
    impossibleExpiry:false,legitimateOffset:true,
    currentActive:true,futureActive:false,tamperedActive:false
  });
  // End-to-end module integration inside Chrome Android: the same store
  // confirmation must stop producing automatic savings at Paris midnight,
  // including for legacy confirmations saved with the old UTC cutoff.
  const localConfirmationCalendar=await page.evaluate(async()=>{
    const {
      createStoreConfirmation,applyLocalStoreConfirmations,isStoreConfirmationActive
    }=await import("./src/local-verification.js");
    const offer={
      id:"calendar-proof",eans:["3017624010701"],
      requiresStoreVerification:true,expiresAt:"2026-10-10",
      autoStack:false
    };
    const location={store:"leclerc",locationKey:"id:123"};
    const at=(text)=>new Date(text);
    const confirmation=createStoreConfirmation(offer,{
      ...location,confirmedAt:at("2026-10-10T21:30:00Z")
    });
    const checked=(now,proof=confirmation)=>
      applyLocalStoreConfirmations([offer],[proof],{
        ...location,now:at(now)
      })[0];
    const before=checked("2026-10-10T21:59:59.999Z");
    const after=checked("2026-10-10T22:00:00Z");
    const previousUtcSaved={
      ...confirmation,validUntil:"2026-10-10T23:59:59.999Z"
    };
    let futureProofRejected=false;
    try{
      createStoreConfirmation({...offer,verifiedAt:"2026-10-11"},{
        ...location,confirmedAt:at("2026-10-10T20:00:00Z")
      });
    }catch{futureProofRejected=true;}
    const dayStartOffer={...offer,startsAt:"2026-10-10"};
    const startOfParisDay=createStoreConfirmation(dayStartOffer,{
      ...location,confirmedAt:at("2026-10-09T22:10:00Z")
    });
    const seasonalDeadlines=[
      ["2026-03-29","2026-03-29T12:00:00Z"],
      ["2026-10-25","2026-10-25T12:00:00Z"]
    ].map(([date,confirmedAt])=>
      createStoreConfirmation({...offer,expiresAt:date},{
        ...location,confirmedAt:at(confirmedAt)
      }).validUntil
    );
    return {
      cutoff:confirmation.validUntil,
      beforeVerified:before.storeVerified===true && before.autoStack===true,
      afterVerified:after.storeVerified===true || after.autoStack===true,
      oldSavedProofAccepted:isStoreConfirmationActive(previousUtcSaved,offer,{
        ...location,now:at("2026-10-10T22:30:00Z")
      }),
      futureProofRejected,
      parisDayStart:startOfParisDay.confirmedAt,
      seasonalDeadlines
    };
  });
  assert.deepEqual(localConfirmationCalendar,{
    cutoff:"2026-10-10T21:59:59.999Z",
    beforeVerified:true,afterVerified:false,oldSavedProofAccepted:false,
    futureProofRejected:true,parisDayStart:"2026-10-09T22:10:00.000Z",
    seasonalDeadlines:[
      "2026-03-29T21:59:59.999Z","2026-10-25T22:59:59.999Z"
    ]
  });
  // Full basket integration in the actual Android browser: having a
  // loyalty card cannot prove benefit activation, eligibility or PASS payment.
  // A historical offer must never become guaranteed even when the caller
  // forgets to pre-filter its date.
  const loyaltyBasketSafety=await page.evaluate(async()=>{
    const {evaluateBasketStore}=await import("./src/basket.js");
    const {buildProductLoyaltyOffers}=await import("./src/loyalty.js");
    const product={code:"3017624010701",name:"Produit Carrefour Bio",
      brands:"Carrefour Bio",categories:[]};
    const items=[{product,quantity:1}];
    const priceByCode={"3017624010701":[
      {price:10,date:"2026-10-11",storeName:"Carrefour"}
    ]};
    const scenario=(carrefour,offers=[],now="2026-10-12T12:00:00Z")=>
      evaluateBasketStore(items,{
        store:"carrefour",channel:"store",priceByCode,offers,
        loyaltyProfile:{carrefour},now:new Date(now)
      });
    const club=scenario("club");
    const pass=scenario("pass");
    const expired=scenario("none",[{
      id:"expired-retailer",scope:"produit",stores:["carrefour"],
      eans:[product.code],savingPercent:80,autoStack:true,
      verifiedAt:"2026-10-07",reviewAfter:"2026-10-08"
    }]);
    const pastReview=scenario("club",[],"2026-10-26T12:00:00Z");
    const contextual=buildProductLoyaltyOffers(product,{
      store:"carrefour",profile:{carrefour:"pass"}
    })[0];
    return {
      clubSaving:club.guaranteedSaving,
      clubPotential:club.potentialProductSaving,
      passSaving:pass.guaranteedSaving,
      passPotential:pass.potentialProductSaving,
      expiredSaving:expired.guaranteedSaving,
      expiredMatches:expired.lines[0].matches.length,
      afterReview:pastReview.lines[0].matches.length,
      falseExact:(contextual.eans||[]).length,
      wrongAutoStack:contextual.autoStack
    };
  });
  assert.deepEqual(loyaltyBasketSafety,{
    clubSaving:0,clubPotential:1,
    passSaving:0,passPotential:1.5,
    expiredSaving:0,expiredMatches:0,afterReview:0,
    falseExact:0,wrongAutoStack:false
  });
  // Actual basket, budget and strategy modules exercised together in
  // Pixel 7: neither a missing checkout cost nor a weeks-old receipt may
  // produce an apparently reliable under-budget / store-winner result.
  const budgetTruthfulness=await page.evaluate(async()=>{
    const {evaluateShoppingBudget}=await import("./src/budget.js");
    const {evaluateBasketStore}=await import("./src/basket.js");
    const {summarizeBasketStrategies}=await import("./src/strategy.js");
    const budget=(scenario)=>evaluateShoppingBudget([scenario],{
      budget:20,channel:"store",nearbyEnabled:true
    }).results[0].status;
    const stub=(checkoutCost,patch={})=>({
      store:"carrefour",checkoutCost,distinctCount:1,pricedCount:1,
      missingCount:0,isComplete:true,
      locationReliable:true,priceChannelReliable:true,...patch
    });
    const product={code:"3017624010701",name:"Produit témoin",
      brands:"Marque témoin",categories:[]};
    const makeBasket=(date)=>evaluateBasketStore(
      [{product,quantity:1}],{
        store:"carrefour",channel:"store",loyaltyProfile:{carrefour:"none"},
        priceByCode:{"3017624010701":[{price:10,date,storeName:"Carrefour"}]},
        now:new Date("2026-10-11T12:00:00Z")
      }
    );
    const old=makeBasket("2026-09-20");
    const fresh=makeBasket("2026-10-10");
    const boundary=makeBasket("2026-10-04"); // 7.5 days, not 7 days
    const oldReliable={...old,locationReliable:true,priceChannelReliable:true};
    const freshReliable={...fresh,locationReliable:true,priceChannelReliable:true};
    return {
      nullTotal:budget(stub(null)),
      emptyTotal:budget(stub("")),
      falseTotal:budget(stub(false)),
      incomplete:budget(stub(10,{distinctCount:2,pricedCount:1})),
      age:old.oldestPriceAgeDays,
      freshAge:fresh.oldestPriceAgeDays,
      boundaryRoundedAge:boundary.oldestPriceAgeDays,
      boundaryPastSevenDays:boundary.oldestPriceAgeExactDays>7,
      boundaryBudget:budget({...boundary,locationReliable:true,priceChannelReliable:true}),
      oldBudget:budget(oldReliable),
      freshBudget:budget(freshReliable),
      strategy:summarizeBasketStrategies([
        freshReliable,{...oldReliable,store:"leclerc"}
      ],{channel:"store",nearbyEnabled:true}).status,
      singleRetailer:summarizeBasketStrategies([freshReliable],{
        channel:"store",nearbyEnabled:true
      }).status,
      duplicateRetailer:summarizeBasketStrategies([
        freshReliable,{...freshReliable,finalCost:9}
      ],{channel:"store",nearbyEnabled:true}).status,
      missingPeer:summarizeBasketStrategies([
        freshReliable,{...freshReliable,store:"leclerc",isComplete:false}
      ],{channel:"store",nearbyEnabled:true}).status,
      invalidPeer:summarizeBasketStrategies([
        freshReliable,{...freshReliable,store:"leclerc",finalCost:null}
      ],{channel:"store",nearbyEnabled:true}).status,
      freshPair:summarizeBasketStrategies([
        freshReliable,{...freshReliable,store:"leclerc",finalCost:11}
      ],{channel:"store",nearbyEnabled:true}).status,
      partialSearchPair:summarizeBasketStrategies([
        freshReliable,{...freshReliable,store:"leclerc",finalCost:11}
      ],{channel:"store",nearbyEnabled:true,coverageIncomplete:true}).status,
      boundaryPair:summarizeBasketStrategies([
        freshReliable,{...boundary,store:"leclerc",
          locationReliable:true,priceChannelReliable:true}
      ],{channel:"store",nearbyEnabled:true}).status
    };
  });
  assert.deepEqual(budgetTruthfulness,{
    nullTotal:"unavailable",emptyTotal:"unavailable",falseTotal:"unavailable",
    incomplete:"partial-unknown",
    age:21,freshAge:1,boundaryRoundedAge:7,boundaryPastSevenDays:true,
    boundaryBudget:"indicative-within",oldBudget:"indicative-within",
    freshBudget:"within",strategy:"indicative",
    singleRetailer:"insufficient",duplicateRetailer:"insufficient",
    missingPeer:"insufficient",invalidPeer:"insufficient",
    freshPair:"ready",partialSearchPair:"indicative",boundaryPair:"indicative"
  });
  // Corrupted barcode text must never become an "exact GTIN" by dropping
  // arbitrary characters. Bad checksums must not contact external APIs.
  const strictSkuSafety=await page.evaluate(async()=>{
    const {assertValidGtin,canonicalGtin}=await import("./src/gtin.js");
    const {fetchProductByBarcode,fetchPricesByBarcode}=await import("./src/open-data.js");
    const {serializeShoppingList}=await import("./src/shopping-list-transfer.js");
    const valid=assertValidGtin("3017 6240 10701");
    const corrupt="EAN:3017624010701";
    let corruptRejected=false,backupRejected=false;
    try{assertValidGtin(corrupt);}catch{corruptRejected=true;}
    try{
      serializeShoppingList([{product:{code:corrupt,name:"Produit test"},quantity:1}]);
    }catch{backupRejected=true;}
    let requests=0;
    const badFetch=async()=>{requests++;throw new Error("unreachable");};
    let productRejected=false,priceRejected=false;
    try{await fetchProductByBarcode("3017624010702",badFetch);}
    catch(error){productRejected=/Checksum GTIN invalide/.test(error.message);}
    try{
      await fetchPricesByBarcode("3017624010702",{
        store:"carrefour",fetchImpl:badFetch
      });
    }catch(error){priceRejected=/Checksum GTIN invalide/.test(error.message);}
    return {
      valid,corruptRejected,backupRejected,
      corruptCanonical:canonicalGtin(corrupt),
      productRejected,priceRejected,requests
    };
  });
  assert.deepEqual(strictSkuSafety,{
    valid:"3017624010701",corruptRejected:true,backupRejected:true,
    corruptCanonical:null,productRejected:true,priceRejected:true,requests:0
  });
  // When a merchant failed to reconfirm its public offer snapshot, the
  // browser may keep the candidate but must never silently auto-stack it.
  const failedSourceSafety=await page.evaluate(async()=>{
    const {loadImportedOffers}=await import("./src/import-loader.js");
    const offer={
      providerId:"leclerc",externalId:"outage-exact",title:"Offre témoin",
      scope:"produit",stores:["leclerc"],savingPercent:20,
      verifiedAt:"2026-10-10",reviewAfter:"2026-10-15",
      sourceUrl:"https://www.e.leclerc/",
      eans:["3017624010701"],
      eanEvidenceUrl:"https://www.e.leclerc/fp/produit-3017624010701",
      autoStack:true,autoStackWhenEligible:true
    };
    const now=new Date("2026-10-12T12:00:00Z");
    const run=async(checkedAt,status)=>{
      const fetchImpl=async(url)=>{
        const file=String(url);
        if(file.endsWith("/index.json")){
          return {ok:true,json:async()=>({files:["outage.json"]})};
        }
        if(file.endsWith("/outage.json")){
          return {ok:true,json:async()=>[offer]};
        }
        if(file.endsWith("/source-sync-status.json") && checkedAt){
          return {ok:true,json:async()=>({sources:{leclerc:{
            status,checkedAt,reason:"Catalogue non reconfirmé",
            extractedCount:0,previousSnapshotCount:1
          }}})};
        }
        return {ok:false,status:404};
      };
      const result=await loadImportedOffers({fetchImpl,now});
      const x=result.offers[0];
      return {autoStack:x?.autoStack,autoStackWhenEligible:x?.autoStackWhenEligible,
        warning:x?.sourceSyncWarning?.status||null,
        verifiedAt:x?.verifiedAt};
    };
    const real=await loadImportedOffers();
    return {
      confirmed:await run(null,null),
      failed:await run("2026-10-11T09:00:00Z","unavailable"),
      partial:await run("2026-10-11T09:00:00Z","partial"),
      older:await run("2026-10-09T09:00:00Z","unavailable"),
      future:await run("2026-10-13T09:00:00Z","unavailable"),
      realWarningCount:real.offers.filter((x)=>x.sourceSyncWarning).length
    };
  });
  assert.deepEqual(failedSourceSafety.confirmed,{
    // Proof-backed normal autoStack stays allowed, but the imported
    // post-card reactivation flag is always suppressed.
    autoStack:true,autoStackWhenEligible:false,warning:null,
    verifiedAt:"2026-10-10"
  });
  for(const state of [failedSourceSafety.failed,failedSourceSafety.partial]){
    assert.equal(state.autoStack,false);
    assert.equal(state.autoStackWhenEligible,false);
    assert.equal(state.verifiedAt,"2026-10-10");
    assert.ok(["unavailable","partial"].includes(state.warning));
  }
  assert.equal(failedSourceSafety.older.autoStack,true);
  assert.equal(failedSourceSafety.future.autoStack,true);
  // Shopmium has its own provider-owned sync status file. A source outage
  // must be visible for active ODRs, with no fabricated verification date.
  const shopmiumOutage=await page.evaluate(async()=>{
    const {loadImportedOffers}=await import("./src/import-loader.js");
    const raw={
      providerId:"shopmium",externalId:"stock",title:"Promo alimentaire",
      scope:"produit",stores:["all"],savingPercent:30,
      verifiedAt:"2026-10-09",reviewAfter:"2026-10-14",
      sourceUrl:"https://offers.shopmium.com/fr/n/kiri-6",
      productMatch:{brands:["Kiri"]}
    };
    const fetchImpl=async(url)=>{
      const file=String(url);
      if(file.endsWith("/index.json")){
        return {ok:true,json:async()=>({files:["shopmium-auto.json"]})};
      }
      if(file.endsWith("/shopmium-auto.json")){
        return {ok:true,json:async()=>[raw]};
      }
      if(file.endsWith("/source-sync-shopmium.json")){
        return {ok:true,json:async()=>({sources:{shopmium:{
          status:"unavailable",checkedAt:"2026-10-11T18:35:00Z",
          extractedCount:0,previousSnapshotCount:1,
          reason:"Accès officiel non disponible"
        }}})};
      }
      return {ok:false,status:404};
    };
    const before=await loadImportedOffers({
      fetchImpl,now:new Date("2026-10-11T19:30:00Z")
    });
    const expired=await loadImportedOffers({
      fetchImpl,now:new Date("2026-10-16T19:30:00Z")
    });
    return {
      active:before.offers.length,
      warning:before.offers[0]?.sourceSyncWarning?.status||null,
      sourceStatus:before.sourceStats[0]?.status,
      originalVerifiedAt:before.offers[0]?.verifiedAt,
      confirmedCount:before.sourceStats[0]?.syncState?.confirmedCount,
      expiredCount:expired.offers.length
    };
  });
  assert.deepEqual(shopmiumOutage,{
    active:1,warning:"unavailable",sourceStatus:"sync-warning",
    originalVerifiedAt:"2026-10-09",confirmedCount:0,expiredCount:0
  });
  // A failed source refresh must never dominate the default offers screen.
  assert.equal(await page.locator("#sourceProof").inputValue(),"without-failure");
  const safeInitialCount=await page.locator("#offers .card").count();
  assert.match(await page.locator("#offerVerificationSummary").innerText(),
    /offre\(s\).*(masquée|masquées)/);
  assert.doesNotMatch(await page.locator("#offers").innerText(),/Source non reconfirmée/);
  await page.locator("#sourceProof").selectOption("all");
  const allCount=await page.locator("#offers .card").count();
  assert.ok(allCount>=safeInitialCount);
  // A provider can have historical warnings without any current
  // matching card (Coupon Network now refreshes successfully). The screen
  // must be checked against its actual visible candidates, not all source
  // warnings from unrelated stores or expired offers.
  if(allCount>safeInitialCount){
    assert.match(await page.locator("#offers").innerText(),/Source non reconfirmée/);
  }else{
    assert.doesNotMatch(await page.locator("#offers").innerText(),/Source non reconfirmée/);
  }
  await page.locator("#sourceProof").selectOption("failed");
  for(const card of await page.locator("#offers .card").all()){
    assert.match(await card.innerText(),/Source non reconfirmée/);
  }
  await page.locator("#sourceProof").selectOption("without-failure");
  assert.equal(await page.locator("#offers .card").count(),safeInitialCount);
  await page.reload({waitUntil:"domcontentloaded"});
  assert.equal(await page.locator("#sourceProof").inputValue(),"without-failure");
  const statusFixture=JSON.parse(await readFile(
    new URL("../data/import/source-sync-status.json",import.meta.url),"utf8"
  ));
  if(statusFixture.sources?.["coupon-network"]?.status==="unavailable"){
    await page.waitForFunction(()=>
      document.querySelector("#sourceHealth")?.textContent?.includes("Source non actualisée"),
      {timeout:12000}
    );
    assert.match(await page.locator("#sourceHealth").textContent(),/Coupon Network/i);
    assert.match(await page.locator("#sourceHealth").textContent(),/échéance|révision/i);
    assert.match(await page.locator("#sourceHealth").textContent(),/Offres reconfirmées/i);
  }
  // Real imported-source diagnostics must survive in the mobile PWA even
  // when the merchants are unreachable. Their archived offer counts must
  // never be described as newly confirmed savings.
  for(const [source,filename,label] of [
    ["carrefour","source-sync-carrefour.json","Carrefour"],
    ["leclerc","source-sync-leclerc.json","E.Leclerc"]
  ]){
    const fixture=JSON.parse(await readFile(
      new URL("../data/import/"+filename,import.meta.url),"utf8"
    )).sources?.[source];
    if(fixture && ["unavailable","partial"].includes(fixture.status)){
      await page.waitForFunction((expected)=>
        document.querySelector("#sourceHealth")?.textContent?.includes(expected),
        label,{timeout:12000}
      );
      const text=await page.locator("#sourceHealth").innerText();
      assert.match(text,/Source non actualisée|Obsolète/);
      assert.ok(text.includes(fixture.extractedCount+"/"+fixture.previousSnapshotCount));
      assert.match(text,/Les anciennes offres expirent normalement/);
      const officialUrl=source==="carrefour"
        ? "https://www.carrefour.fr/catalogue"
        : "https://www.e.leclerc/prospectus";
      const manualLink=page.locator('#sourceHealth a.open[href="'+officialUrl+'"]');
      assert.ok(await manualLink.count()>0,
        "Une source magasin non confirmée doit donner accès au catalogue officiel");
      assert.equal(await manualLink.first().getAttribute("target"),"_blank");
    }
  }
  // Fallback links are channel-aware: physical Carrefour/Leclerc
  // catalogues are not proof of Drive checkout promotions. The links
  // must update instantly on Android and never create basket savings.
  const carrefourStoreLink=page.locator(
    '#sourceHealth a.open[href="https://www.carrefour.fr/catalogue"]'
  );
  assert.ok(await carrefourStoreLink.count()>0,
    "La source Carrefour épuisée doit conserver son lien magasin officiel");
  await page.locator("#channel").selectOption("drive");
  await page.locator(
    '#sourceHealth a.open[href="https://www.carrefour.fr/promotions"]'
  ).first().waitFor({state:"attached",timeout:8000});
  assert.match(await page.locator("#sourceHealth").innerText(),
    /Sélectionnez votre Drive ou lieu de livraison/i);
  assert.equal(await carrefourStoreLink.count(),0,
    "Le catalogue magasin ne doit pas être proposé comme tarif Drive");
  await page.locator("#channel").selectOption("online");
  assert.ok(await page.locator(
    '#sourceHealth a.open[href="https://www.carrefour.fr/promotions"]'
  ).count()>0);
  await page.locator("#channel").selectOption("store");
  assert.ok(await carrefourStoreLink.count()>0);
  const carrefourEvidenceGuard=await page.evaluate(async()=>{
    const {verifyCarrefourPromotionPage}=
      await import("./src/adapters/carrefour-promotions.js");
    const offer={
      sourceUrl:"https://www.carrefour.fr/p/pates-fusilli-panzani-3038359913242",
      savingPercent:30,sourcePromoPrice:1.11,sourceRegularPrice:1.59,
      eans:["3038359913242"],
      productMatch:{brands:["Panzani"],all:["fusilli"]}
    };
    const html="<h1>Pâtes Fusilli PANZANI</h1>"+
      "<p>1,11 € au lieu de 1,59 € PROMO : 30%</p>";
    return {
      legitimate:verifyCarrefourPromotionPage(html,offer).ok,
      noPrice:verifyCarrefourPromotionPage(html,{
        ...offer,sourceRegularPrice:null
      }).ok,
      noH1:verifyCarrefourPromotionPage(
        html.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/i,"<p>$1</p>"),offer
      ).ok,
      unrelatedTitle:verifyCarrefourPromotionPage(
        html.replace("Pâtes Fusilli PANZANI","Promotion du moment")
          +"<p>Pâtes Fusilli PANZANI</p>",offer
      ).ok
    };
  });
  assert.deepEqual(carrefourEvidenceGuard,{
    legitimate:true,noPrice:false,noH1:false,unrelatedTitle:false
  });

  // Real Coupon Network public catalogue cards place the amount after
  // the product condition, unlike the historical coupon pages. Exercise
  // the browser adapter, including a shell with no product offers, before
  // trusting an automated source refresh.
  const publicCouponCards=await page.evaluate(async()=>{
    const {parseCouponNetworkCards,assessCouponNetworkSnapshot}=
      await import("./src/adapters/coupon-network.js");
    const html=`<main>
      <p>Jusqu'à 409 € d'économies sur vos courses</p>
      <article><h3>Bonduelle - Carottes râpées au Citron de Sicile</h3>
      <p>Sur l'achat d'une barquette de carottes râpées Bonduelle.</p>
      <span>0,20 €</span><span>remboursé</span><button>Activer l'offre</button></article>
      <article><h3>Grand'Mère - Café moulu</h3>
      <p>Sur l'achat de 2 paquets de café moulu Grand'Mère.</p>
      <strong>1,20 € remboursé</strong><button>Activer l'offre</button></article>
      <article><h3>Publicité sans remboursement prouvé</h3>
      <p>Sur l'achat d'une bouteille.</p><span>5 €</span>
      <button>Découvrir</button></article>
    </main>`;
    const options={verifiedAt:"2026-10-11",
      sourceUrl:"https://prod-cn-offers.couponnetwork.fr/"};
    const offers=parseCouponNetworkCards(html,options);
    return {
      count:offers.length,
      titles:offers.map((offer)=>offer.title),
      amounts:offers.map((offer)=>offer.savingAmount),
      minimum:offers.map((offer)=>offer.minPurchaseQty),
      source:offers[0]?.sourceUrl,
      unsafe:offers.some((offer)=>offer.autoStack===true
        || (offer.eans||[]).length>0),
      empty:parseCouponNetworkCards("<main>Offres disponibles 0</main>",options).length,
      otherDomain:parseCouponNetworkCards(html,{
        ...options,sourceUrl:"https://example.com/"
      }).length,
      publishEmpty:assessCouponNetworkSnapshot([],{minimum:20,previousCount:118}).publish
    };
  });
  assert.deepEqual(publicCouponCards,{
    count:2,
    titles:["Bonduelle - Carottes râpées au Citron de Sicile",
      "Grand'Mère - Café moulu"],
    amounts:[0.2,1.2],minimum:[1,2],
    source:"https://prod-cn-offers.couponnetwork.fr/",
    unsafe:false,empty:0,otherDomain:0,publishEmpty:false
  });

  // Coupon Network uses a generic source category for public cards.
  // The live importer must retain food coupons while excluding known
  // household/pet/alcohol products below the requested 50% threshold.
  const foodScopeSafety=await page.evaluate(async()=>{
    const {normalizeImportedOffer}=await import("./src/ingestion.js");
    const {filterOffers}=await import("./src/domain.js");
    const sample=(id,title,description,savingPercent=null)=>{
      const normalized=normalizeImportedOffer({
        providerId:"coupon-network",externalId:"scope-"+id,
        title,conditions:description,category:"autre",
        verifiedAt:"2026-10-11",reviewAfter:"2026-10-18",
        sourceUrl:"https://prod-cn-offers.couponnetwork.fr/",
        stores:["all"],scope:"produit",savingAmount:savingPercent===null?0.5:null,
        savingPercent,mechanism:"manufacturer_refund",autoStack:false
      });
      if(!normalized.ok) throw new Error(normalized.errors.join(" | "));
      return normalized.value;
    };
    const offers=[
      sample("food","Bonduelle - Carottes râpées","Barquette de carottes"),
      sample("clean","Maison Verte - Lessives","Sur l'achat d'une lessive"),
      sample("pet","PURINA - Croquettes pour chat","Pour chat adulte"),
      sample("beauty","Elmex - Dentifrices","Sur l'achat d'un dentifrice"),
      sample("dish","Sun - Capsules","Sur l'achat de capsules lave-vaisselle"),
      sample("moisture","Rubson - Absorbeurs","Pack absorbeur Aero 360"),
      sample("spirits","Altos - Tequila Blanco","Bouteille de tequila"),
      sample("high","Schwarzkopf - Shampooings","Shampooing au choix",70),
      sample("nonalc","Chouffe - Bières sans alcool","Pack sans alcool")
    ];
    return {
      categories:offers.map((offer)=>offer.category),
      visible:filterOffers(offers,{store:"carrefour",channel:"store"})
        .map((offer)=>offer.externalId),
      suspiciousGuaranteed:offers.some((offer)=>offer.autoStack===true)
    };
  });
  assert.deepEqual(foodScopeSafety,{
    categories:["autre","non-alimentaire","non-alimentaire",
      "non-alimentaire","non-alimentaire","non-alimentaire",
      "hors-alimentaire","non-alimentaire","autre"],
    visible:["scope-food","scope-high","scope-nonalc"],
    suspiciousGuaranteed:false
  });

  // The published snapshot includes its own trusted Shopmium diagnostics,
  // independently from the legacy Coupon Network and retailer status files.
  const currentShopmiumStatus=JSON.parse(await readFile(
    new URL("../data/import/source-sync-shopmium.json",import.meta.url),"utf8"
  )).sources?.shopmium;
  assert.ok(["updated","partial","unavailable"].includes(
    currentShopmiumStatus?.status
  ));
  const currentShopmiumHealth=await page.evaluate(async()=>{
    const {loadImportedOffers}=await import("./src/import-loader.js");
    const catalog=await loadImportedOffers();
    const statistic=catalog.sourceStats.find((row)=>
      row.file==="shopmium-auto.json"
    );
    return {
      count:catalog.offers.filter((row)=>row.providerId==="shopmium").length,
      status:statistic?.status||null,
      failure:statistic?.syncState?.status||null
    };
  });
  assert.ok(currentShopmiumHealth.count>0,
    "Le catalogue officiel Shopmium doit rester chargé sur Android");
  if(currentShopmiumStatus.status==="updated"){
    assert.equal(currentShopmiumHealth.failure,null,
      "La dernière réussite Shopmium ne doit pas apparaître comme une panne");
  }else{
    assert.equal(currentShopmiumHealth.failure,currentShopmiumStatus.status,
      "Le diagnostic Shopmium dédié doit apparaître dans la PWA Android");
  }
  // Mixed Open Prices date formats must be ordered by actual timestamps.
  const latestReceipt=await page.evaluate(async()=>{
    const {priceCoverageSummary}=await import("./src/exact-sku-comparison.js");
    return priceCoverageSummary([
      {price:3,date:"2026-10-11T00:30:00Z"},
      {price:4,date:"2026-10-11"}
    ],new Date("2026-10-11T12:00:00Z")).latestDate;
  });
  assert.equal(latestReceipt,"2026-10-11T00:30:00Z");
  // A bad Open Prices date must never create a false recent price or a
  // cross-retailer winner in the installed browser module.
  const invalidPriceDateSafety=await page.evaluate(async()=>{
    const {isFreshObservation}=await import("./src/open-data.js");
    const {comparePriceObservationEvidence,priceCoverageSummary}=await import(
      "./src/exact-sku-comparison.js"
    );
    const today=new Date("2026-03-02T12:00:00Z");
    const entry=(date,brand)=>({
      date,price:1.5,locationLat:46,locationLon:4,
      retailerText:brand,productCode:"3017624010701"
    });
    return {
      impossibleFresh:isFreshObservation(entry("2026-02-30","Carrefour"),7,today),
      impossibleCoverage:priceCoverageSummary([
        entry("2026-02-30","Carrefour")
      ],today).recent7Days,
      impossiblePair:comparePriceObservationEvidence(
        entry("2026-02-30","Carrefour"),
        entry("2026-03-02","E.Leclerc"),today
      ).comparable,
      validIsoCoverage:priceCoverageSummary([
        entry("2026-03-02T00:30:00+01:00","Carrefour")
      ],today).recent7Days
    };
  });
  assert.deepEqual(invalidPriceDateSafety,{
    impossibleFresh:false,impossibleCoverage:0,impossiblePair:false,
    validIsoCoverage:1
  });

  // Civil-day receipts must be usable after midnight in France, even
  // while UTC still reports yesterday. Respect both DST transitions and
  // never classify 7.5-day/30.5-day receipts as ≤7/≤30 days.
  const parisReceiptDates=await page.evaluate(async()=>{
    const {
      isFreshObservation,parsePriceEvidenceDate,priceFreshness,observationAgeDays
    }=await import("./src/open-data.js");
    const october=new Date("2026-10-10T22:30:00Z");
    const march=new Date("2026-03-28T23:30:00Z");
    const autumnDst=new Date("2026-10-24T22:30:00Z");
    const atNoon=new Date("2026-10-11T12:00:00Z");
    return {
      sameDay:isFreshObservation({date:"2026-10-11"},7,october),
      sameDayAge:observationAgeDays({date:"2026-10-11"},october),
      marchMidnight:isFreshObservation({date:"2026-03-29"},7,march),
      octoberMidnight:isFreshObservation({date:"2026-10-25"},7,autumnDst),
      marchUtc:parsePriceEvidenceDate("2026-03-29")?.toISOString(),
      octoberUtc:parsePriceEvidenceDate("2026-10-25")?.toISOString(),
      weekLevel:priceFreshness({date:"2026-10-04"},atNoon).level,
      monthLevel:priceFreshness({date:"2026-09-11"},atNoon).level,
      expiredLevel:priceFreshness({date:"2026-06-13"},atNoon).level,
      weekDayCount:priceFreshness({date:"2026-10-04"},atNoon).ageDays,
      impossible:isFreshObservation({date:"2026-02-30"},7,atNoon)
    };
  });
  assert.deepEqual(parisReceiptDates,{
    sameDay:true,sameDayAge:0,marchMidnight:true,octoberMidnight:true,
    marchUtc:"2026-03-28T23:00:00.000Z",
    octoberUtc:"2026-10-24T22:00:00.000Z",
    weekLevel:"recent",monthLevel:"old",expiredLevel:"stale",
    weekDayCount:7,
    impossible:false
  });

  // Check the *real browser module* against inconsistent pagination metadata.
  // A source that advertises more pages must not become an exhaustive
  // "no price found" just because the current page is empty or short.
  const paginationCoverage=await page.evaluate(async()=>{
    const {fetchPricesByBarcode}=await import("./src/open-data.js");
    const code="3017624010701";
    const receipt={product_code:code,price:2.45,currency:"EUR",price_per:"UNIT",
      date:new Date(Date.now()-86400000).toISOString().slice(0,10),
      location:{osm_brand:"Carrefour"}};
    const run=async(payload)=>{
      let calls=0;
      const result=await fetchPricesByBarcode(code,{
        store:"carrefour",size:2,maxPages:3,minimumMatches:4,
        fetchImpl:async()=>{
          calls++;
          return {ok:true,json:async()=>payload};
        }
      });
      return {calls,moreAvailable:result.moreAvailable,
        incomplete:result.searchIncomplete,matched:result.observations.length};
    };
    return {
      emptyDeclared:await run({pages:4,total:8,items:[]}),
      shortTotal:await run({total:8,items:[receipt]}),
      complete:await run({total:1,items:[receipt]})
    };
  });
  assert.deepEqual(paginationCoverage,{
    emptyDeclared:{calls:1,moreAvailable:true,incomplete:true,matched:0},
    shortTotal:{calls:1,moreAvailable:true,incomplete:true,matched:1},
    complete:{calls:1,moreAvailable:false,incomplete:false,matched:1}
  });

  await assertNoHorizontalOverflow(page,"page d'accueil");
  await page.locator("#savingsFocus").selectOption("full-refund");
  assert.equal(await page.locator("#savingsFocus").inputValue(),"full-refund");
  if(await page.locator("#offers .card").count()===0){
    assert.match(await page.locator("#empty").innerText(),/Aucun remboursement intégral de produit/);
  }else{
    for(const card of await page.locator("#offers .card").all()){
      assert.match(await card.innerText(),/100 % annoncés/);
    }
  }
  await page.reload({waitUntil:"domcontentloaded"});
  assert.equal(await page.locator("#savingsFocus").inputValue(),"full-refund");
  await page.locator("#savingsFocus").selectOption("at-least-50");
  assert.equal(await page.locator("#savingsFocus").inputValue(),"at-least-50");
  await page.locator("#savingsFocus").selectOption("all");
  await assertNoHorizontalOverflow(page,"filtres fortes économies");
  // Scenario simulation uses only the price entered by the shopper.
  await page.locator("#simulatedPrice").fill("2,50");
  await page.locator("#simulatedQuantity").fill("3");
  assert.match(await page.locator("#simulatorSummary").innerText(),/3 article\(s\) à 2,50/);
  await page.locator("#sort").selectOption("estimated");
  const simulatedCards=page.locator("#offers .simulated-offer:not(.not-eligible)");
  await simulatedCards.first().waitFor({timeout:10000});
  const scenarioCard=await simulatedCards.first().innerText();
  assert.match(scenarioCard,/Économie potentielle/);
  assert.match(scenarioCard,/Coût après/);
  await assertNoHorizontalOverflow(page,"simulation 3 articles");
  await page.screenshot({path:OUT+"/07-simulation-gains.png",fullPage:true});
  await page.locator("#simulatedQuantity").fill("101");
  assert.match(await page.locator("#simulatorSummary").innerText(),/quantité entière entre 1 et 100/);
  await page.locator("#simulatedQuantity").fill("1");
  await page.locator("#simulatedPrice").fill("");
  assert.match(await page.locator("#simulatorSummary").innerText(),/Simulation désactivée/);
  await page.locator("#sort").selectOption("percent");
  await page.screenshot({path:OUT+"/01-offres.png",fullPage:true});

  // Discovery: independent food/free services and 50%+ non-food sources are separated.
  await page.locator('[data-tab="providers"]').click();
  // The production catalogue validator must reject calendar-impossible or
  // future "verification" dates, not merely rely on test fixture whitelists.
  const discoveryDateSafety=await page.evaluate(async()=>{
    const {validateDiscoveryProviders}=await import("./src/source-discovery.js");
    const {providers}=await import("./src/data.js");
    const base={id:"date-fixture",name:"Fixture alimentaire",
      segment:"food",url:"https://example.com"};
    const check=(date)=>validateDiscoveryProviders([{
      ...base,discoveryVerifiedAt:date
    }]).filter((error)=>error.includes("discoveryVerifiedAt")).length;
    return {
      catalog:validateDiscoveryProviders(providers).length,
      valid:check("2026-10-08"),
      future:check("2099-01-01"),
      impossible:check("2026-02-30"),
      malformed:check("10/11/2026")
    };
  });
  assert.deepEqual(discoveryDateSafety,{
    catalog:0,valid:0,future:1,impossible:1,malformed:1
  });
  await page.locator("#sourceScope").selectOption("food");
  assert.match(await page.locator("#providers").innerText(),/MonAvisLeRendGratuit/);
  assert.match(await page.locator("#providers").innerText(),/HopHopFood/);
  assert.match(await page.locator("#providers").innerText(),/Bene Bono/);
  await page.locator("#sourceSearch").fill("Bene Bono");
  assert.equal(await page.locator("#providers .provider-card").count(),1);
  assert.equal(await page.locator("#providers .provider-card a.open").first()
    .getAttribute("href"),"https://benebono.fr/");
  await page.locator("#sourceSearch").fill("");
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Showroomprivé/);
  await page.locator("#sourceScope").selectOption("free-food");
  assert.match(await page.locator("#providers").innerText(),/Sampleo/);
  assert.match(await page.locator("#providers").innerText(),/The Insiders/);
  assert.match(await page.locator("#providers").innerText(),/Olio/);
  const olioSource=page.locator("#providers .provider-card")
    .filter({hasText:"Olio"});
  assert.equal(await olioSource.locator('a.open').first().getAttribute("href"),
    "https://olioapp.com/");
  assert.equal(await olioSource.locator('a.open').nth(1).getAttribute("href"),
    "https://play.google.com/store/apps/details?id=com.olioex.android");
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Bene Bono/);
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Quoty/);
  await page.locator("#sourceScope").selectOption("food-odr");
  assert.match(await page.locator("#providers").innerText(),/Quoty/);
  assert.match(await page.locator("#providers").innerText(),/Activité récente non confirmée/);
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Sampleo/);
  await page.locator("#sourceScope").selectOption("other-50");
  assert.match(await page.locator("#providers").innerText(),/Veepee/);
  assert.match(await page.locator("#providers").innerText(),/Showroomprivé/);
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Geev/);
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Olio/);
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Bene Bono/);
  await page.locator("#sourceSearch").fill("veepee");
  assert.equal(await page.locator("#providers .provider-card").count(),1);
  await page.locator("#sourceSearch").fill("");
  await page.locator("#sourceScope").selectOption("food");
  await assertNoHorizontalOverflow(page,"annuaire de sources");
  await page.screenshot({path:OUT+"/06-sources-alimentaires.png",fullPage:true});
  await page.locator('[data-tab="offers"]').click();

  await page.locator("#channel").selectOption("drive");
  await page.locator("#sort").selectOption("deadline");
  await page.locator("#carrefourLoyalty").selectOption("club");
  assert.match(await page.locator("#loyaltySummary").innerText(),/10%/);
  await page.locator('[data-tab="product"]').click();
  // A malformed barcode must never be silently transformed into a different SKU.
  await page.locator("#barcode").fill("EAN:3017624010701");
  await page.locator('#barcodeForm button[type="submit"]').click();
  assert.match(await page.locator("#productStatus").innerText(),/Code-barres invalide/);
  assert.equal(await page.locator("#compareExactSku").isDisabled(),true);
  // Check exact normalizer loaded by the browser: even a trailing newline,
  // trimmed previously, must not be allowed to select another product.
  const barcodeValidation=await page.evaluate(async()=>{
    const {normalizeBarcode}=await import("./src/open-data.js");
    const rejected=(value)=>{try{normalizeBarcode(value);return false;}catch{return true;}};
    return {
      prefix:rejected("EAN:3017624010701"),
      newline:rejected("3017624010701\n"),
      tab:rejected("\t3017624010701"),
      unicode:rejected("3017624010701\u200b"),
      valid:normalizeBarcode("3017-6240 10701")
    };
  });
  assert.deepEqual(barcodeValidation,{
    prefix:true,newline:true,tab:true,unicode:true,valid:"3017624010701"
  });
  await page.locator("#barcode").fill("3017-6240 10701");
  await page.locator('#barcodeForm button[type="submit"]').click();
  await page.locator("#productResult h2").waitFor({timeout:10000});
  assert.equal(await page.locator("#barcode").inputValue(),"3017624010701");
  // A rejected next scan must not leave a stale, actionable product visible.
  await page.locator("#barcode").fill("3017624010701x");
  await page.locator('#barcodeForm button[type="submit"]').click();
  assert.match(await page.locator("#productStatus").innerText(),/Code-barres invalide/);
  assert.equal(await page.locator("#productResult").isVisible(),false);
  assert.equal(await page.locator("#compareExactSku").isDisabled(),true);
  assert.equal(await page.locator("#priceResults").innerText(),"");
  // Repeat a clean scan to verify normal lookup still works.
  await page.locator("#barcode").fill("3017624010701");
  await page.locator('#barcodeForm button[type="submit"]').click();
  await page.locator("#productResult h2").waitFor({timeout:10000});
  assert.match(await page.locator("#productResult").innerText(),/Pâte à tartiner témoin/);
  assert.equal(await page.locator("#cancelBarcodeLookup").isVisible(),false);
  // Stall a real product request while price data remains available. Cancelling
  // must clear any prior SKU and ignore even a late success from Open Food Facts.
  let releaseStalledProduct;
  let markProductStalled;
  const productStalled=new Promise((resolve)=>{markProductStalled=resolve;});
  const stalledProductHandler=async(route)=>{
    markProductStalled();
    await new Promise((resolve)=>{releaseStalledProduct=resolve;});
    try{
      await route.fulfill({status:200,contentType:"application/json",
        body:JSON.stringify({product:{
          code:"3017624010701",product_name:"Réponse tardive non autorisée"
        }})});
    }catch{
      // Expected if the browser aborted this request before fulfilment.
    }
  };
  const stalledProductPattern="https://world.openfoodfacts.org/api/v3/product/**";
  await page.route(stalledProductPattern,stalledProductHandler);
  await page.locator("#barcode").fill("3017624010701");
  await page.locator('#barcodeForm button[type="submit"]').click();
  await productStalled;
  assert.equal(await page.locator("#cancelBarcodeLookup").isVisible(),true);
  await page.locator("#cancelBarcodeLookup").click();
  assert.match(await page.locator("#productStatus").innerText(),/Recherche annulée/);
  assert.equal(await page.locator("#cancelBarcodeLookup").isVisible(),false);
  assert.equal(await page.locator("#productResult").isVisible(),false);
  assert.equal(await page.locator("#compareExactSku").isDisabled(),true);
  releaseStalledProduct();
  await page.unroute(stalledProductPattern,stalledProductHandler);
  await page.waitForTimeout(100);
  assert.doesNotMatch(await page.locator("#productStatus").innerText(),/Recherche du produit/);
  assert.equal(await page.locator("#productResult").isVisible(),false);
  // A new clean search must immediately work after manual cancellation.
  await page.locator("#barcode").fill("3017624010701");
  await page.locator('#barcodeForm button[type="submit"]').click();
  await page.locator("#productResult h2").waitFor({timeout:10000});
  assert.match(await page.locator("#productResult").innerText(),/Pâte à tartiner témoin/);
  assert.equal(await page.locator("#cancelBarcodeLookup").isVisible(),false);
  // Compare the very same EAN across two retailers; do not use a brand-only
  // match or a physical-store receipt as a Drive/delivery quotation.
  await page.locator("#channel").selectOption("store");
  await page.locator("#exactSkuQuantity").fill("3");
  await page.locator("#compareExactSku").click();
  await page.locator("#exactSkuComparison .exact-sku-grid").waitFor({timeout:15000});
  assert.equal(await page.locator("#exactSkuComparison .exact-sku-store").count(),2);
  assert.equal(await page.locator("#exactSkuComparison .exact-sku-coverage").count(),2);
  assert.match(await page.locator("#exactSkuComparison").innerText(),/Couverture des données/);
  assert.match(await page.locator("#exactSkuComparison").innerText(),/Une absence de relevé ne signifie pas/);
  const exactStoreCards=await page.locator("#exactSkuComparison").innerText();
  assert.match(exactStoreCards,/Meme produit|Même produit/);
  assert.match(exactStoreCards,/3,49/);
  assert.match(exactStoreCards,/3,59/);
  assert.match(exactStoreCards,/Carrefour Lyon/);
  assert.match(exactStoreCards,/E.Leclerc Lyon/);
  assert.match(exactStoreCards,/Relevé inférieur sur la paire comparable : Carrefour/);
  assert.match(exactStoreCards,/Relevés retenus pour la comparaison locale/);
  // The displayed receipt AND the actual selected comparison pair must link
  // to the Open Prices record itself, without trusting arbitrary provider URLs.
  const priceSourceLinks=await page.locator(
    '#exactSkuComparison a[href^="https://prices.openfoodfacts.org/prices/"]'
  ).evaluateAll((items)=>items.map((item)=>item.getAttribute("href")));
  assert.equal(priceSourceLinks.length,4);
  assert.equal(priceSourceLinks.filter((url)=>url.endsWith("/1")).length,2);
  assert.equal(priceSourceLinks.filter((url)=>url.endsWith("/2")).length,2);
  const validatedPriceUrls=await page.evaluate(async()=>{
    const {priceObservationPublicUrl}=await import("./src/open-data.js");
    return [
      priceObservationPublicUrl(120),
      priceObservationPublicUrl("javascript:alert(1)"),
      priceObservationPublicUrl("../fake"),
      priceObservationPublicUrl(0),
      priceObservationPublicUrl(Number.MAX_SAFE_INTEGER+1)
    ];
  });
  assert.deepEqual(validatedPriceUrls,[
    "https://prices.openfoodfacts.org/prices/120",null,null,null,null
  ]);

  assert.equal(await page.locator('[data-action="expand-exact-sku"]').count(),0,
    "Un relevé complet ne nécessite pas de recherche approfondie");
  assert.match(exactStoreCards,/0,10/);
  assert.match(exactStoreCards,/Quantité : 3 articles/);
  assert.match(exactStoreCards,/Projection pour 3 articles/);
  assert.match(exactStoreCards,/10,47/);
  assert.match(exactStoreCards,/10,77/);
  // A user with a stalled mobile connection must be able to cancel the
  // exact-SKU lookup and immediately retry without stale results appearing.
  let releaseSlowPriceRoute,markSlowRequest;
  const slowPriceGate=new Promise((resolve)=>{releaseSlowPriceRoute=resolve;});
  const slowPriceStarted=new Promise((resolve)=>{markSlowRequest=resolve;});
  const stalledExactSkuRoute=async(route)=>{
    markSlowRequest();
    await slowPriceGate;
    try{
      await route.fulfill({status:200,contentType:"application/json",
        body:JSON.stringify({total:0,items:[]})});
    }catch{
      // Expected when AbortController cancels an intercepted request.
    }
  };
  await page.route("https://prices.openfoodfacts.org/**",stalledExactSkuRoute);
  await page.locator("#compareExactSku").click();
  await slowPriceStarted;
  await page.locator('[data-action="cancel-exact-sku"]').click();
  assert.match(await page.locator("#exactSkuComparison").innerText(),/Recherche annulée/);
  assert.equal(await page.locator("#compareExactSku").isEnabled(),true);
  releaseSlowPriceRoute();
  await page.unroute("https://prices.openfoodfacts.org/**",stalledExactSkuRoute);
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#exactSkuComparison .exact-sku-store").count(),0,
    "Une réponse arrivée après annulation ne doit jamais réafficher les cartes");
  await page.locator("#compareExactSku").click();
  await page.locator("#exactSkuComparison .exact-sku-grid").waitFor({timeout:15000});
  assert.equal(await page.locator("#exactSkuComparison .exact-sku-store").count(),2);

  assert.match(exactStoreCards,/écart indicatif hors promotions : 0,30/);
  assert.match(exactStoreCards,/Débours estimé avant remboursements pour 3 articles/);
  assert.match(exactStoreCards,/10,47/);
  assert.match(exactStoreCards,/10,77/);
  // Quantity errors must be handled locally before any network requests.
  await page.locator("#exactSkuQuantity").fill("0");
  await page.locator("#compareExactSku").click();
  assert.match(await page.locator("#exactSkuComparison").innerText(),
    /quantité entière de 1 à 100/);
  await page.locator("#exactSkuQuantity").fill("3");
  assert.equal(await page.locator("#exactSkuComparison").innerText(),"");
  await page.locator("#compareExactSku").click();
  await page.locator("#exactSkuComparison .exact-sku-grid").waitFor({timeout:15000});
  assert.match(await page.locator("#exactSkuComparison").innerText(),/Quantité : 3 articles/);
  // The comparison module must still reject stale or far-away receipts
  // inside the actual Android browser runtime.
  const locationSafety=await page.evaluate(async()=>{
    const {comparePriceObservationEvidence}=await import("./src/exact-sku-comparison.js");
    const a={
      date:"2026-10-08",city:"Paris",postcode:"75011",
      locationLat:48.853,locationLon:2.35
    };
    const b={
      date:"2026-10-08",city:"Marseille",postcode:"13001",
      locationLat:43.30,locationLon:5.38
    };
    const close={...b,city:"Paris",postcode:"75011",
      locationLat:48.854,locationLon:2.351};
    const now=new Date("2026-10-09T12:00:00Z");
    return {
      far:comparePriceObservationEvidence(a,b,now).status,
      near:comparePriceObservationEvidence(a,close,now).comparable,
      dateMismatch:comparePriceObservationEvidence(a,{
        ...close,date:"2026-10-02"
      },now).comparable
    };
  });
  assert.deepEqual(locationSafety,{far:"too-far",near:true,dateMismatch:false});
  // Precision matters: rounding 3 days + 30 min to one decimal used to
  // incorrectly permit a store price comparison.
  const strictDateGap=await page.evaluate(async()=>{
    const {comparePriceObservationEvidence}=await import("./src/exact-sku-comparison.js");
    const base={date:"2026-10-08T12:00:00Z",
      city:"Lyon",postcode:"69002",locationLat:45.76,locationLon:4.84};
    const compare=(date)=>comparePriceObservationEvidence(base,
      {...base,date},new Date("2026-10-11T15:00:00Z"));
    const exact=compare("2026-10-11T12:00:00Z");
    const over=compare("2026-10-11T12:30:00Z");
    return {exact:exact.comparable,over:over.comparable,
      reason:over.status,reportedGap:over.dateGapDays};
  });
  assert.deepEqual(strictDateGap,
    {exact:true,over:false,reason:"dates-too-far",reportedGap:3.03});

  // Run the actual fetch/normalization path in Android Chrome: two retailer
  // callers must reuse each Open Prices page while keeping prices isolated.
  const sharedPriceProbe=await page.evaluate(async()=>{
    const {createSharedPriceFetch,fetchPricesByBarcode}
      =await import("./src/open-data.js");
    let httpCalls=0,jsonDecodes=0;
    const today=new Date().toISOString().slice(0,10);
    const backend=async(url)=>{
      httpCalls+=1;
      const pageNumber=Number(new URL(url).searchParams.get("page")||1);
      const brand=pageNumber===1?"Carrefour":"E.Leclerc";
      return {ok:true,status:200,json:async()=>{
        jsonDecodes+=1;
        return {pages:2,total:2,items:[{
          id:pageNumber,product_code:"3017624010701",
          price:pageNumber===1?3.49:3.59,currency:"EUR",date:today,
          location:{osm_brand:brand,osm_name:brand+" Lyon"}
        }]};
      }};
    };
    const shared=createSharedPriceFetch(backend);
    const [carrefour,leclerc]=await Promise.all(["carrefour","leclerc"]
      .map((store)=>fetchPricesByBarcode("3017624010701",{
        store,fetchImpl:shared,size:1,maxPages:2,minimumMatches:3
      })));
    return {
      httpCalls,jsonDecodes,
      pricesCarrefour:carrefour.observations.map(x=>x.price),
      pricesLeclerc:leclerc.observations.map(x=>x.price),
      pagesCarrefour:carrefour.pagesFetched,
      pagesLeclerc:leclerc.pagesFetched
    };
  });
  assert.deepEqual(sharedPriceProbe,{
    httpCalls:2,jsonDecodes:2,
    pricesCarrefour:[3.49],pricesLeclerc:[3.59],
    pagesCarrefour:2,pagesLeclerc:2
  });
  const selectedPair=await page.evaluate(async()=>{
    const {selectComparablePricePair}=await import("./src/exact-sku-comparison.js");
    const today=new Date("2026-10-09T12:00:00Z");
    const make=(store,price,city,postcode,date)=>({
      id:store+city,price,storeName:store+" "+city,
      city,postcode,date
    });
    const pair=selectComparablePricePair([
      make("Carrefour",1.2,"Paris","75011","2026-10-09"),
      make("Carrefour",3.2,"Lyon","69002","2026-10-08")
    ],[
      make("E.Leclerc",3.5,"Lyon","69002","2026-10-08")
    ],today);
    return pair?.carrefour.city || null;
  });
  assert.equal(selectedPair,"Lyon");
  // Dense public receipt histories must stay responsive on mobile without
  // materializing and sorting all 180 x 180 cross-store combinations.
  const densePair=await page.evaluate((date)=>{
    const code="3017624010701";
    const make=(store,id,price,lat,lon)=>({
      id:store+id,productCode:code,price,date,storeName:store,
      city:"Lyon",postcode:"69002",locationLat:lat,locationLon:lon
    });
    const a=Array.from({length:180},(_,i)=>make("c",i,3+i/100,45.760,4.840));
    const b=Array.from({length:180},(_,i)=>make("l",i,4+i/100,45.761,4.841));
    return import("./src/exact-sku-comparison.js").then(({selectComparablePricePair})=>{
      const winner=selectComparablePricePair(a,b,new Date());
      return {carrefour:winner?.carrefour.id,leclerc:winner?.leclerc.id,
        distance:winner?.evidence.distanceKm};
    });
  },RECENT_RECEIPT_DATE);
  assert.deepEqual({carrefour:densePair.carrefour,leclerc:densePair.leclerc},
    {carrefour:"c179",leclerc:"l179"});
  assert.ok(densePair.distance<2);
  // The Open Prices record creation/update timestamps are not proof of
  // when a receipt was observed. Undated rows must not suppress later pages.
  const observedDateProvenance=await page.evaluate(async(receiptDate)=>{
    const {fetchPricesByBarcode,selectBestRecentPrice}=
      await import("./src/open-data.js");
    const code="3017624010701",pages=[];
    const source=(id,hasReceiptDate=false)=>({
      id,product_code:code,price:hasReceiptDate?4.5:2.1,
      currency:"EUR",updated:receiptDate,created:receiptDate,
      ...(hasReceiptDate?{date:receiptDate}:{}),
      location:{osm_brand:"Carrefour",osm_name:"Carrefour Lyon"}
    });
    const lookup=await fetchPricesByBarcode(code,{
      store:"carrefour",size:4,maxPages:2,minimumMatches:1,
      fetchImpl:async(url)=>{
        const p=Number(new URL(url).searchParams.get("page")||1);
        pages.push(p);
        return {ok:true,json:async()=>({
          pages:2,total:5,
          items:p===1?[source(1),source(2),source(3),source(4)]:[source(5,true)]
        })};
      }
    });
    return {
      pages,undated:lookup.observations.filter(x=>!x.date).length,
      best:selectBestRecentPrice(lookup.observations,30)?.price??null
    };
  },RECENT_RECEIPT_DATE);
  assert.deepEqual(observedDateProvenance,
    {pages:[1,2],undated:4,best:4.5});
  // A cancelled price request must stop immediately in the real Android
  // browser runtime and must not be treated as incomplete provider coverage.
  const abortedPriceLookup=await page.evaluate(async()=>{
    const {fetchPricesByBarcode}=await import("./src/open-data.js");
    const controller=new AbortController();
    let networkCalls=0,abortNotified=false;
    const lookup=fetchPricesByBarcode("3017624010701",{
      store:"carrefour",signal:controller.signal,
      fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>{
        networkCalls++;
        signal.addEventListener("abort",()=>{
          abortNotified=true;
          reject(new DOMException("Aborted","AbortError"));
        },{once:true});
      })
    });
    controller.abort();
    try{
      await lookup;
      return {error:"missing",networkCalls,abortNotified};
    }catch(error){
      return {error:error.name,networkCalls,abortNotified};
    }
  });
  assert.deepEqual(abortedPriceLookup,
    {error:"AbortError",networkCalls:1,abortNotified:true});



  // The previously computed pair must disappear when the comparison context changes.
  await page.locator("#radiusSelect").selectOption("10");
  assert.equal(await page.locator("#exactSkuComparison").innerText(),"");
  await page.locator("#compareExactSku").click();
  await page.locator("#exactSkuComparison .exact-sku-grid").waitFor({timeout:15000});
  await page.locator("#leclercLoyalty").selectOption("card");
  assert.equal(await page.locator("#exactSkuComparison").innerText(),"");
  await page.locator("#compareExactSku").click();
  await page.locator("#exactSkuComparison .exact-sku-grid").waitFor({timeout:15000});
  await assertNoHorizontalOverflow(page,"comparaison EAN exact, deux enseignes");
  await page.screenshot({path:OUT+"/08-comparaison-ean-exact.png",fullPage:true});
  // Emulate a paginated source where only the first pages were consulted;
  // the UI must not present this as a complete store inventory search.
  const requestedPricePages=[];
  const partialSearchRoute=async(route)=>{
    requestedPricePages.push(Number(new URL(route.request().url()).searchParams.get("page")||1));
    const code=new URL(route.request().url()).searchParams.get("product_code");
    await route.fulfill({
      status:200,contentType:"application/json",
      body:JSON.stringify({total:250,pages:3,items:[
        {id:1,product_code:code,price:3.49,currency:"EUR",date:RECENT_RECEIPT_DATE,
          location:{osm_brand:"Carrefour",osm_name:"Carrefour Lyon",
            osm_lat:45.760,osm_lon:4.84,osm_address_postcode:"69002",
            osm_address_city:"Lyon"}},
        {id:2,product_code:code,price:3.59,currency:"EUR",date:RECENT_RECEIPT_DATE,
          location:{osm_brand:"E.Leclerc",osm_name:"E.Leclerc Lyon",
            osm_lat:45.761,osm_lon:4.85,osm_address_postcode:"69003",
            osm_address_city:"Lyon"}}
      ]})
    });
  };
  await page.route("https://prices.openfoodfacts.org/**",partialSearchRoute);
  await page.locator("#compareExactSku").click();
  await page.waitForFunction(()=>
    (document.querySelector("#exactSkuComparison")?.textContent||"")
      .includes("Recherche limitée aux premières pages"),
    {timeout:15000}
  );
  assert.equal(await page.locator("#exactSkuComparison .exact-sku-store").count(),2);
  assert.match(await page.locator("#exactSkuComparison").innerText(),/dans les pages consultées/);
  const expand=page.locator('[data-action="expand-exact-sku"]');
  await expand.waitFor({timeout:15000});
  await expand.click();
  await page.waitForFunction(()=>document.querySelector(".exact-sku-search-depth")?.textContent?.includes("Recherche approfondie terminée"),{timeout:15000});
  assert.ok(requestedPricePages.includes(3),"Le bouton doit interroger la troisième page Open Prices");
  assert.equal(await expand.count(),0,"Pas de boucle d'extension une fois la recherche approfondie terminée");
  const futureCoverage=await page.evaluate(async()=>{
    const {priceCoverageSummary}=await import("./src/exact-sku-comparison.js");
    return priceCoverageSummary([{price:3.49,date:"2026-10-11"}],
      new Date("2026-10-09T12:00:00Z")).status;
  });
  assert.equal(futureCoverage,"invalid-observations",
    "Un relevé futur ne peut pas devenir un prix récent");
  await assertNoHorizontalOverflow(page,"recherche EAN approfondie");
  await page.unroute("https://prices.openfoodfacts.org/**",partialSearchRoute);
  // A second-page outage must be visible as incomplete coverage and keep
  // the first-page observations usable. Retry is a deliberate user action.
  const secondPageFailure=async(route)=>{
    const query=new URL(route.request().url()).searchParams;
    if(query.get("page")==="2"){
      await route.fulfill({status:503,contentType:"text/plain",body:"temporary outage"});
      return;
    }
    const code=query.get("product_code");
    await route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify({pages:3,total:300,items:[
        {id:51,product_code:code,price:3.49,currency:"EUR",
          date:RECENT_RECEIPT_DATE,
          location:{osm_brand:"Carrefour",osm_name:"Carrefour Lyon",
            osm_lat:45.760,osm_lon:4.84,osm_address_postcode:"69002",
            osm_address_city:"Lyon"}},
        {id:52,product_code:code,price:3.59,currency:"EUR",
          date:RECENT_RECEIPT_DATE,
          location:{osm_brand:"E.Leclerc",osm_name:"E.Leclerc Lyon",
            osm_lat:45.761,osm_lon:4.85,osm_address_postcode:"69003",
            osm_address_city:"Lyon"}}
      ]})
    });
  };
  await page.route("https://prices.openfoodfacts.org/**",secondPageFailure);
  await page.locator("#compareExactSku").click();
  await page.waitForFunction(()=>document.querySelector("#exactSkuComparison")
    ?.textContent?.includes("Recherche partiellement interrompue"),{timeout:15000});
  assert.match(await page.locator("#exactSkuComparison").innerText(),/3,49/);
  await page.locator('[data-action="expand-exact-sku"]').click();
  await page.waitForFunction(()=>document.querySelector(".exact-sku-search-depth")
    ?.textContent?.includes("Couverture toujours partielle"),{timeout:15000});
  await page.unroute("https://prices.openfoodfacts.org/**",secondPageFailure);
  // A discounted single-unit receipt must never be extrapolated into the
  // checkout cost for three units, even though its unit price is visible.
  const discountedReceiptRoute=async(route)=>{
    const code=new URL(route.request().url()).searchParams.get("product_code");
    await route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify({total:2,items:[
        {id:801,product_code:code,price:1.49,price_is_discounted:true,
          currency:"EUR",date:RECENT_RECEIPT_DATE,
          location:{osm_brand:"Carrefour",osm_name:"Carrefour Lyon",
            osm_lat:45.760,osm_lon:4.84,osm_address_postcode:"69002",
            osm_address_city:"Lyon"}},
        {id:802,product_code:code,price:3.59,
          currency:"EUR",date:RECENT_RECEIPT_DATE,
          location:{osm_brand:"E.Leclerc",osm_name:"E.Leclerc Lyon",
            osm_lat:45.761,osm_lon:4.85,osm_address_postcode:"69003",
            osm_address_city:"Lyon"}}
      ]})
    });
  };
  await page.route("https://prices.openfoodfacts.org/**",discountedReceiptRoute);
  await page.locator("#compareExactSku").click();
  await page.locator("#exactSkuComparison .exact-sku-grid").waitFor({timeout:15000});
  const discountedCard=page.locator("#exactSkuComparison .exact-sku-store").first();
  assert.match(await discountedCard.innerText(),/prix remisé ponctuel/i);
  assert.match(await discountedCard.innerText(),/n'est pas projeté/i);
  assert.equal(await discountedCard.locator(".exact-sku-initial-cost").count(),0);
  assert.equal(await discountedCard.locator(".exact-sku-discount-warning").count(),1);
  assert.equal(await page.locator("#exactSkuComparison .exact-sku-initial-cost").count(),1,
    "La projection de l'autre enseigne non remisée reste disponible");
  assert.doesNotMatch(await page.locator("#exactSkuComparison").innerText(),
    /Relevé inférieur sur la paire comparable/);
  await page.unroute("https://prices.openfoodfacts.org/**",discountedReceiptRoute);
  await page.locator("#channel").selectOption("drive");
  assert.equal(await page.locator("#exactSkuComparison").innerText(),"");
  const drivePriceRequests=[];
  const drivePriceProbe=async(route)=>{
    drivePriceRequests.push(route.request().url());
    await route.fallback();
  };
  await page.route("https://prices.openfoodfacts.org/**",drivePriceProbe);
  await page.locator("#compareExactSku").click();
  await page.locator("#exactSkuComparison .exact-sku-grid").waitFor({timeout:15000});
  assert.deepEqual(drivePriceRequests,[],
    "Le mode Drive ne doit pas consulter inutilement les prix de magasins physiques");
  await page.unroute("https://prices.openfoodfacts.org/**",drivePriceProbe);
  assert.match(await page.locator("#exactSkuComparison").innerText(),
    /Aucun prix magasin réutilisé comme prix Drive/);
  assert.match(await page.locator("#exactSkuComparison").innerText(),
    /Prix physiques non interrogés/);
  assert.doesNotMatch(await page.locator("#exactSkuComparison").innerText(),
    /Aucun relevé trouvé pour cet EAN/);
  assert.equal(await page.locator('[data-action="expand-exact-sku"]').count(),0);
  await page.locator("#priceResults").getByText("Dernier prix observé",{exact:false}).waitFor({timeout:10000});
  assert.match(await page.locator("#priceResults").innerText(),/Observation du/i);
  await page.locator('[data-action="add-current-product"]').click();
  await page.locator('[data-tab="list"]').click();
  assert.match(await page.locator("#shoppingListItems").innerText(),/Pâte à tartiner témoin/);
  assert.match(await page.locator("#listCount").textContent(),/1/);
  await page.locator("#shoppingBudget").fill("3,00");
  assert.match(await page.locator("#budgetSummary").innerText(),/Prix indisponibles/);
  const basketRequests=[];
  const basketRequestProbe=async(route)=>{
    const url=route.request().url();
    if(new URL(url).searchParams.get("product_code")==="3017624010701"){
      basketRequests.push(url);
    }
    await route.fallback();
  };
  await page.route("https://prices.openfoodfacts.org/**",basketRequestProbe);
  await page.locator("#refreshList").click();
  await page.locator("#refreshList").waitFor({state:"visible"});
  await page.waitForFunction(()=>!document.querySelector("#refreshList").disabled,{timeout:15000});
  await page.unroute("https://prices.openfoodfacts.org/**",basketRequestProbe);
  assert.equal(basketRequests.length,1,
    "L'actualisation d'un EAN doit télécharger une seule fois la page commune Carrefour/E.Leclerc");
  assert.match(await page.locator("#basketComparison").innerText(),/Relevé du/i);
  const budgetPriceSources=await page.locator(
    '#basketComparison .basket-price-source a[href^="https://prices.openfoodfacts.org/prices/"]'
  ).evaluateAll((items)=>items.map((node)=>node.getAttribute("href")));
  assert.ok(budgetPriceSources.includes("https://prices.openfoodfacts.org/prices/1"),
    "Le prix Carrefour du budget doit être traçable au relevé original");
  assert.ok(budgetPriceSources.includes("https://prices.openfoodfacts.org/prices/2"),
    "Le prix E.Leclerc du budget doit être traçable au relevé original");

  assert.match(await page.locator("#budgetSummary").innerText(),/Plafond dépassé sur les données disponibles/);
  assert.match(await page.locator("#budgetSummary").innerText(),/3,49/);
  await page.locator("#shoppingBudget").fill("6,00");
  assert.match(await page.locator("#budgetSummary").innerText(),/Sous le plafond sur les données disponibles/);
  await assertNoHorizontalOverflow(page,"liste de courses");
  await page.screenshot({path:OUT+"/02-panier.png",fullPage:true});

  // A successful first and second page do not make a basket exhaustive if
  // Open Prices advertises further pages. Budget confidence must drop.
  await page.locator("#channel").selectOption("store");
  const limitedBasketSearch=async(route)=>{
    const u=new URL(route.request().url());
    const pageNumber=Number(u.searchParams.get("page")||1);
    const code=u.searchParams.get("product_code");
    await route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify({pages:4,total:400,items:[
        {id:900+pageNumber*2,product_code:code,price:3.49,
          currency:"EUR",date:RECENT_RECEIPT_DATE,
          location:{osm_brand:"Carrefour",osm_name:"Carrefour Lyon",
            osm_lat:45.760,osm_lon:4.84,osm_address_postcode:"69002",
            osm_address_city:"Lyon"}},
        {id:901+pageNumber*2,product_code:code,price:3.59,
          currency:"EUR",date:RECENT_RECEIPT_DATE,
          location:{osm_brand:"E.Leclerc",osm_name:"E.Leclerc Lyon",
            osm_lat:45.761,osm_lon:4.85,osm_address_postcode:"69003",
            osm_address_city:"Lyon"}}
      ]})
    });
  };
  await page.route("https://prices.openfoodfacts.org/**",limitedBasketSearch);
  await page.locator("#refreshList").click();
  await page.waitForFunction(()=>!document.querySelector("#refreshList").disabled,{timeout:15000});
  const limitedBasketStatus=await page.locator("#listStatus").innerText();
  assert.match(limitedBasketStatus,/Actualisation indicative/);
  assert.match(limitedBasketStatus,/2 limitée/);
  assert.match(await page.locator("#budgetSummary").innerText(),/Recherche de prix incomplète/);
  await page.unroute("https://prices.openfoodfacts.org/**",limitedBasketSearch);

  // An in-flight basket refresh must not inject obsolete prices after the
  // shopper switches channels. Delay a real browser request before aborting.
  const slowBasketRoute=async(route)=>{
    const code=new URL(route.request().url()).searchParams.get("product_code");
    await new Promise((resolve)=>setTimeout(resolve,900));
    try{
      await route.fulfill({status:200,contentType:"application/json",
        body:JSON.stringify({total:2,items:[
          {id:1101,product_code:code,price:9.99,currency:"EUR",
            date:RECENT_RECEIPT_DATE,
            location:{osm_brand:"Carrefour",osm_name:"Carrefour Lyon",
              osm_lat:45.760,osm_lon:4.84,osm_address_postcode:"69002",
              osm_address_city:"Lyon"}},
          {id:1102,product_code:code,price:8.88,currency:"EUR",
            date:RECENT_RECEIPT_DATE,
            location:{osm_brand:"E.Leclerc",osm_name:"E.Leclerc Lyon",
              osm_lat:45.761,osm_lon:4.85,osm_address_postcode:"69003",
              osm_address_city:"Lyon"}}
        ]})
      });
    }catch{
      // Aborted browser requests can close before the mock fulfils.
    }
  };
  await page.route("https://prices.openfoodfacts.org/**",slowBasketRoute);
  const slowRequestStarted=page.waitForRequest((request)=>
    request.url().includes("prices.openfoodfacts.org")
      && request.url().includes("product_code=3017624010701"),{timeout:8000});
  await page.locator("#refreshList").click();
  await slowRequestStarted;
  await page.locator("#channel").selectOption("drive");
  assert.match(await page.locator("#listStatus").innerText(),/Actualisation annulée/);
  assert.equal(await page.locator("#refreshList").isDisabled(),false);
  await new Promise((resolve)=>setTimeout(resolve,1050));
  await page.locator("#channel").selectOption("store");
  assert.doesNotMatch(await page.locator("#basketComparison").innerText(),/9,99|8,88/,
    "Les anciens relevés reçus après annulation ne doivent pas remplacer les prix du panier");
  assert.equal(await page.locator("#cancelRefreshList").isVisible(),false);
  // A user with limited mobile data needs an explicit way to cancel a slow
  // refresh without changing the current store or clearing the basket.
  const userCancelStarted=page.waitForRequest((request)=>
    request.url().includes("prices.openfoodfacts.org")
      && request.url().includes("product_code=3017624010701"),{timeout:8000});
  await page.locator("#refreshList").click();
  await userCancelStarted;
  assert.equal(await page.locator("#cancelRefreshList").isVisible(),true);
  assert.equal(await page.locator("#refreshList").isDisabled(),true);
  await page.locator("#cancelRefreshList").click();
  assert.equal(await page.locator("#cancelRefreshList").isVisible(),false);
  assert.equal(await page.locator("#refreshList").isDisabled(),false);
  assert.match(await page.locator("#listStatus").innerText(),/Actualisation annulée/);
  await new Promise((resolve)=>setTimeout(resolve,1050));
  assert.doesNotMatch(await page.locator("#basketComparison").innerText(),/9,99|8,88/);
  await page.unroute("https://prices.openfoodfacts.org/**",slowBasketRoute);

  // Manual shelf-price note: never a guaranteed retailer promotion.
  await page.locator("#manualPricePanel").evaluate((element)=>{element.open=true;});
  await page.locator("#manualPriceStore").selectOption("carrefour");
  await page.locator("#manualPriceAmount").fill("2.69");
  await page.locator("#manualPriceStoreName").fill("Carrefour Centre Lyon");
  await page.locator("#manualPricePostcode").fill("69002");
  const localDate=await page.evaluate(()=>{
    const now=new Date();
    return new Date(now.getTime()-now.getTimezoneOffset()*60000)
      .toISOString().slice(0,10);
  });
  await page.locator("#manualPriceDate").fill(localDate);
  await page.locator("#manualPriceSubmit").click();
  // Wait for the actual save result instead of brittle wording in a distant card.
  await page.locator("#manualPriceStatus").filter({hasText:/\S/}).waitFor({timeout:8000});
  const manualSaveStatus=await page.locator("#manualPriceStatus").innerText();
  assert.match(manualSaveStatus,/Prix personnel enregistré/,"Enregistrement relevé : "+manualSaveStatus);
  const manualEntry=await page.locator("#manualPriceEntries").innerText();
  assert.match(manualEntry,/2,69/);
  assert.match(manualEntry,/Relevé personnel · non vérifié/);
  // A private shelf observation must remain clearly identified; a verified
  // Open Prices observation may still be selected instead for the basket.
  assert.match(await page.locator("#basketComparison").innerText(),/Confiance|Comparaison/);
  await assertNoHorizontalOverflow(page,"relevé manuel");
  await page.screenshot({path:OUT+"/05-releve-manuel.png",fullPage:true});
  await page.locator("#channel").selectOption("drive");

  await page.locator('[data-tab="optimizer"]').click();
  await page.locator("#basketAmount").fill("73.25");
  assert.match(await page.locator("#optimizerResult").innerText(),/73,25/);
  await assertNoHorizontalOverflow(page,"optimiseur");
  await page.screenshot({path:OUT+"/03-optimiseur.png",fullPage:true});

  await page.reload({waitUntil:"domcontentloaded"});
  assert.equal(await page.locator("#channel").inputValue(),"drive");
  assert.equal(await page.locator("#carrefourLoyalty").inputValue(),"club");
  await page.locator('[data-tab="list"]').click();
  assert.equal(await page.locator("#shoppingBudget").inputValue(),"6,00");
  assert.match(await page.locator("#budgetSummary").innerText(),/6,00/);
  assert.match(await page.locator("#shoppingListItems").innerText(),/Pâte à tartiner témoin/);
  await page.locator("#manualPricePanel").evaluate((element)=>{element.open=true;});
  assert.match(await page.locator("#manualPriceEntries").innerText(),/Carrefour Centre Lyon/);

  // Real Android browser flow: JSON download, destructive restore prompt, persistence.
  const [download]=await Promise.all([
    page.waitForEvent("download"),
    page.locator("#exportList").click()
  ]);
  assert.match(download.suggestedFilename(),/promo-alimentaire-liste-.*\.json/);
  const exported=await readFile(await download.path(),"utf8");
  assert.equal(JSON.parse(exported).budget,6);
  assert.equal(JSON.parse(exported).items.length,1);
  await page.locator("#clearList").click();
  assert.equal(await page.locator("#listCount").textContent(),"0");
  page.once("dialog",(dialog)=>dialog.accept());
  await page.locator("#importListFile").setInputFiles({
    name:"liste.json",mimeType:"application/json",buffer:Buffer.from(exported)
  });
  await page.getByText("Liste restaurée : 1 produit(s).",{exact:false}).waitFor();
  assert.equal(await page.locator("#shoppingBudget").inputValue(),"6,00");
  assert.match(await page.locator("#shoppingListItems").innerText(),/Pâte à tartiner témoin/);
  await page.locator("#importListFile").setInputFiles({
    name:"invalid.json",mimeType:"application/json",buffer:Buffer.from("{broken")
  });
  // File.text() resolves asynchronously; never inspect an old success status.
  await page.locator("#listStatus").filter({hasText:/Restauration impossible/}).waitFor({timeout:8000});
  assert.match(await page.locator("#listStatus").innerText(),/Restauration impossible/);
  assert.equal(await page.locator("#listCount").textContent(),"1");
  await assertNoHorizontalOverflow(page,"sauvegarde et restauration");

  const swSupported=await page.evaluate(()=>"serviceWorker" in navigator);
  assert.equal(swSupported,true,"Service worker unavailable in browser context");
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),{timeout:20000});
  // Real browser integration: a valid but undeclared same-origin file must
  // never fill the PWA cache, while the declared offline index remains saved.
  const boundedCache=await page.evaluate(async()=>{
    const offRoot=new URL("./",location.href);
    const extraUrl=new URL("./data/import/README.md",offRoot);
    const response=await fetch(extraUrl);
    // Let the worker's waitUntil cache decision finish before inspecting it.
    await new Promise((resolve)=>setTimeout(resolve,400));
    const names=(await caches.keys()).filter((name)=>
      name.startsWith("promo-alimentaire-")
    );
    const cache=await caches.open(names.at(-1));
    const extra=await cache.match(extraUrl.href);
    const shell=await cache.match(new URL("./index.html",offRoot).href);
    const badQuery=await cache.keys();
    return {
      extraHTTP:response.status,
      extraCached:Boolean(extra),
      shellCached:Boolean(shell),
      queryVariants:badQuery.filter((request)=>new URL(request.url).search).length
    };
  });
  assert.equal(boundedCache.extraHTTP,200,
    "L'integration doit utiliser un document réel accessible en HTTP 200");
  assert.equal(boundedCache.extraCached,false,
    "Un document hors manifeste ne doit pas entrer dans le cache Android");
  assert.equal(boundedCache.shellCached,true,
    "La coquille essentielle doit rester disponible pour l'installation");
  assert.equal(boundedCache.queryVariants,0,
    "Aucune variante de query-string ne doit saturer le stockage hors ligne");
  await context.setOffline(true);
  await page.reload({waitUntil:"domcontentloaded",timeout:25000});
  // Even an installed PWA opened from a shared link with harmless query
  // parameters must resolve to its cached application shell when offline.
  const offlineLink=new URL(BASE);
  offlineLink.searchParams.set("offline","1");
  await page.goto(offlineLink.href,{waitUntil:"domcontentloaded",timeout:25000});
  await page.locator("#stats .stat").first().waitFor({timeout:12000});
  assert.match(await page.locator("h1").innerText(),/Promo Alimentaire/);
  // Verify shared GS1 identity and official evidence modules remain usable offline.
  const eanOffline=await page.evaluate(async()=>{
    const {matchOfferToProduct}=await import("./src/matching.js");
    const {validateRetailerGtinEvidence}=await import("./src/retailer-ean-evidence.js");
    const offer={scope:"produit",eans:["0036000291452"]};
    return {
      same:matchOfferToProduct({code:"036000291452"},offer).exact,
      other:matchOfferToProduct({code:"4006381333931"},offer).exact,
      proof:validateRetailerGtinEvidence({
        providerId:"carrefour",
        eans:["0036000291452"],
        eanEvidenceUrl:"https://www.carrefour.fr/p/produit-036000291452"
      }).ok
    };
  });
  assert.deepEqual(eanOffline,{same:true,other:false,proof:true});
  // Offline imported data must still honour stale-source and Drive-only rules.
  const shopmiumOffline=await page.evaluate(async()=>{
    const {isOfferActive}=await import("./src/ingestion.js");
    const {filterOffers,offerDeadline}=await import("./src/domain.js");
    const campaign={
      providerId:"shopmium",verifiedAt:"2026-10-07",
      expiresAt:"2026-12-31",savingPercent:30
    };
    const kiri={
      id:"kiri",title:"Kiri",provider:"Shopmium",category:"fromage",
      type:"ODR",stores:["all"],channels:["drive","online"],savingPercent:30
    };
    const timed={
      providerId:"shopmium",verifiedAt:"2026-10-12",
      startsAt:"2026-10-09T08:00:00+02:00",
      expiresAt:"2026-10-12T14:07:00+02:00"
    };
    return {
      stale:isOfferActive(campaign,new Date("2026-10-14T12:00:00Z")),
      store:filterOffers([kiri],{store:"leclerc",channel:"store"}).length,
      drive:filterOffers([kiri],{store:"leclerc",channel:"drive"}).length,
      beforeDeadline:isOfferActive(timed,new Date("2026-10-12T12:06:59Z")),
      afterDeadline:isOfferActive(timed,new Date("2026-10-12T12:07:01Z")),
      parisLastMinute:isOfferActive({
        verifiedAt:"2026-10-11",expiresAt:"2026-10-11"
      },new Date("2026-10-11T21:59:59Z")),
      parisNextDay:isOfferActive({
        verifiedAt:"2026-10-11",expiresAt:"2026-10-11"
      },new Date("2026-10-11T22:00:00Z")),
      countdownTomorrow:offerDeadline({expiresAt:"2026-10-12"},
        new Date("2026-10-11T21:59:59Z")).daysUntil,
      countdownToday:offerDeadline({expiresAt:"2026-10-12"},
        new Date("2026-10-11T22:00:00Z")).daysUntil
    };
  });
  assert.deepEqual(shopmiumOffline,{
    stale:false,store:0,drive:1,beforeDeadline:true,afterDeadline:false,
    parisLastMinute:true,parisNextDay:false,
    countdownTomorrow:1,countdownToday:0
  });
  await page.locator('[data-tab="list"]').click();
  assert.equal(await page.locator("#shoppingBudget").inputValue(),"6,00");
  await assertNoHorizontalOverflow(page,"mode hors ligne");
  await page.screenshot({path:OUT+"/04-hors-ligne.png",fullPage:true});
  await context.setOffline(false);

  // Functional Android regression: older receipt changes must not appear
  // as current shopping alerts. A recent discounted receipt is explicitly
  // labelled as a potentially temporary price, not a guaranteed shelf drop.
  await page.evaluate(()=>{
    const day=(offset)=>{
      const date=new Date();
      date.setUTCDate(date.getUTCDate()+offset);
      return date.toISOString().slice(0,10);
    };
    const code="3017624010701";
    const entry=(shop,offset,price,discounted)=>({
      id:code+"|carrefour|id:"+shop+"|"+day(offset)+"|"+price,
      recordedAt:new Date().toISOString(),code,
      name:"Pâte à tartiner témoin",store:"carrefour",
      price,date:day(offset),
      locationKey:"id:"+shop,locationId:shop,
      storeName:"Carrefour Lyon",postcode:"69002",city:"Lyon",
      isDiscounted:discounted
    });
    localStorage.setItem("promo-product-price-history-v1",JSON.stringify([
      entry(701,-40,10,false),entry(701,-35,7,false),
      entry(702,-3,10,false),entry(702,0,7,true)
    ]));
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator('[data-tab="list"]').click();
  await page.locator("#priceAlerts .price-alert-card").first().waitFor({timeout:10000});
  assert.equal(await page.locator("#priceAlerts .price-alert-card").count(),1,
    "Les baisses archivées depuis plus de 14 jours ne sont pas des alertes courantes");
  assert.match(await page.locator("#priceAlerts").innerText(),/Baisses de prix observées récemment/);
  assert.match(await page.locator("#priceAlerts").innerText(),/Dernier relevé/);
  assert.match(await page.locator("#priceAlerts").innerText(),/Prix remisé sur le ticket/);
  await assertNoHorizontalOverflow(page,"alertes de baisse datées sur Android");

  // A newer singleton receipt in shop A must not hide the valid two-day
  // price trend from shop B. A caller pinning shop A still gets no trend.
  const trendEvidence=await page.evaluate(async()=>{
    const {productPriceTrend}=await import("./src/product-history.js");
    const date=(days)=>{
      const d=new Date();
      d.setUTCDate(d.getUTCDate()+days);
      return d.toISOString().slice(0,10);
    };
    const row=(id,price,days)=>({
      id:"receipt-"+id+"-"+days,
      code:"3017624010701",store:"carrefour",
      locationId:id,storeName:"Carrefour shop "+id,
      price,date:date(days)
    });
    const history=[row(88,4,0),row(77,10,-5),row(77,9,-2)];
    const chosen=productPriceTrend(history,{code:"3017624010701",store:"carrefour"});
    const pinned=productPriceTrend(history,{
      code:"3017624010701",store:"carrefour",locationId:88
    });
    return {shop:chosen?.locationKey,delta:chosen?.delta,pinned};
  });
  assert.deepEqual(trendEvidence,{shop:"id:77",delta:-1,pinned:null});
  await assertNoHorizontalOverflow(page,"tendance historique de magasin comparable");
  // Functional regression: UPC-A/EAN-13/GTIN-14 are the same verified GS1
  // product across historical records, repeated receipts and drop alerts.
  const barcodeHistory=await page.evaluate(async()=>{
    const {addPriceObservation,historyProductKey,productHistory,productPriceTrend,detectPriceDrops}
      =await import("./src/product-history.js");
    const upc="036000291452",ean="0036000291452",gtin14="00036000291452";
    const on=(offset)=>{
      const d=new Date();d.setUTCDate(d.getUTCDate()+offset);
      return d.toISOString().slice(0,10);
    };
    const old={
      id:"legacy-upca",code:upc,store:"carrefour",
      date:on(-3),price:10,locationId:77,storeName:"Carrefour Lyon",
      name:"Produit témoin",recordedAt:new Date().toISOString()
    };
    const same=addPriceObservation([old],{
      product:{code:ean,name:"Produit témoin"},store:"carrefour",
      observation:{date:on(-3),price:10,locationId:77,storeName:"Carrefour Lyon"},
      recordedAt:new Date()
    });
    const newer=addPriceObservation(same,{
      product:{code:gtin14,name:"Produit témoin"},store:"carrefour",
      observation:{date:on(-1),price:8,locationId:77,storeName:"Carrefour Lyon"},
      recordedAt:new Date()
    });
    const trend=productPriceTrend(newer,{code:upc,store:"carrefour"});
    const alerts=detectPriceDrops(newer,{
      thresholdPercent:10,maxAgeDays:14,now:new Date()
    });
    return {
      canonical:historyProductKey(ean)===historyProductKey(upc)
        && historyProductKey(gtin14)===historyProductKey(ean),
      rows:productHistory(newer,{code:ean,store:"carrefour"}).length,
      deduplicated:same.length===1,
      delta:trend?.delta,alertCount:alerts.length,
      sameAlertKey:alerts[0]?.code===historyProductKey(upc),
      legacyKey:historyProductKey("123")==="123"
    };
  });
  assert.deepEqual(barcodeHistory,{
    canonical:true,rows:2,deduplicated:true,delta:-2,
    alertCount:1,sameAlertKey:true,legacyKey:true
  });
  await assertNoHorizontalOverflow(page,"historique multi-GTIN compatible Android");

  // Functional integration: a list saved by an older version with multiple
  // barcode forms of one GS1 SKU is safely consolidated after reload.
  await page.evaluate(()=>{
    const base={name:"Produit alias",brands:"Marque témoin",quantity:"1 paquet"};
    localStorage.setItem("promo-shopping-list-v1",JSON.stringify([
      {product:{...base,code:"036000291452"},quantity:1},
      {product:{...base,code:"0036000291452"},quantity:2}
    ]));
  });
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator('[data-tab="list"]').click();
  assert.equal(await page.locator("#listCount").textContent(),"1");
  assert.equal(await page.locator("#shoppingListItems .list-item").count(),1);
  assert.match(await page.locator("#shoppingListItems").innerText(),/Produit alias/);
  assert.match(await page.locator("#shoppingListItems .qty").innerText(),/3/);

  const barcodeProductMock=async(route)=>{
    const requestedCode=new URL(route.request().url()).pathname.split("/").at(-1);
    await route.fulfill({
      status:200,contentType:"application/json",
      body:JSON.stringify({product:{
        code:requestedCode,product_name:"Produit alias",
        brands:"Marque témoin",quantity:"1 paquet"
      }})
    });
  };
  await page.route("https://world.openfoodfacts.org/api/v3/product/**",barcodeProductMock);
  await page.locator('[data-tab="product"]').click();
  await page.locator("#barcode").fill("0036000291452");
  await page.locator('#barcodeForm button[type="submit"]').click();
  await page.locator("#productResult h2").waitFor({timeout:10000});
  await page.locator('[data-action="add-current-product"]').click();
  await page.locator('[data-tab="list"]').click();
  assert.equal(await page.locator("#listCount").textContent(),"1",
    "Deux représentations GTIN du même produit ne créent pas deux lignes");
  assert.match(await page.locator("#shoppingListItems .qty").innerText(),/4/);
  await page.unroute("https://world.openfoodfacts.org/api/v3/product/**",barcodeProductMock);

  // Backups containing two UPC/EAN aliases must reject duplicates, rather
  // than quietly overcount products or discard quantities.
  const backupAlias=await page.evaluate(async()=>{
    const {serializeShoppingList}=await import("./src/shopping-list-transfer.js");
    const product=(code)=>({product:{code,name:"Produit alias"},quantity:2});
    try{
      serializeShoppingList([
        product("036000291452"),product("0036000291452")
      ]);
      return "accepted";
    }catch(error){
      return String(error.message);
    }
  });
  assert.match(backupAlias,/Code-barres répété/);
  await assertNoHorizontalOverflow(page,"dédoublonnage UPC EAN de la liste de courses");

  // A personal price entered against an equivalent UPC-A must be visible
  // for the EAN-13 list entry, without reusing another store or another SKU.
  const manualBarcode=await page.evaluate(async()=>{
    const {
      manualPriceObservations,mergeManualPriceObservations,
      saveManualPrice,removeManualPrice
    }=await import("./src/manual-prices.js");
    const now=new Date();
    const date=new Date(now.getTime()-now.getTimezoneOffset()*60000)
      .toISOString().slice(0,10);
    const upc="036000291452",ean="0036000291452";
    const input={
      code:upc,store:"leclerc",storeName:"E.Leclerc Lyon Centre",
      postcode:"69002",date,price:"2,50"
    };
    const matched=manualPriceObservations([input],{store:"leclerc",code:ean,now});
    const unrelated=manualPriceObservations([input],{
      store:"leclerc",code:"4006381333931",now
    });
    const wrongStore=manualPriceObservations([input],{
      store:"carrefour",code:ean,now
    });
    const merged=mergeManualPriceObservations({
      [ean]:[{id:"existing",price:2.99,date}]
    },[input],{store:"leclerc",now});
    const updated=saveManualPrice([input],{
      ...input,code:ean,price:"2,20"
    },{now});
    return {
      match:matched.length,unrelated:unrelated.length,
      wrongStore:wrongStore.length,
      targetCount:merged[ean].length,
      aliasCreated:upc in merged,
      sameId:updated.length===1,
      updatedPrice:updated[0]?.price,
      removed:removeManualPrice(updated,updated[0].id,{now}).length
    };
  });
  assert.deepEqual(manualBarcode,{
    match:1,unrelated:0,wrongStore:0,
    targetCount:2,aliasCreated:false,
    sameId:true,updatedPrice:2.2,removed:0
  });
  await assertNoHorizontalOverflow(page,"prix personnels et variantes GTIN");

  for(const width of [360,320]){
    await page.setViewportSize({width,height:750});
    await assertNoHorizontalOverflow(page,"largeur "+width+"px");
  }
  assert.deepEqual(jsErrors,[],"Unhandled JavaScript errors");
  assert.deepEqual(failedLocal,[],"HTTP errors for local assets");
  console.log("[mobile] Chromium Android emulation: navigation, product lookup, list, optimizer, storage, offline and 320/360/393px PASS");
}finally{
  await browser.close();
}

async function assertNoHorizontalOverflow(page,label){
  const geometry=await page.evaluate(()=>({
    viewport:window.innerWidth,
    width:document.documentElement.scrollWidth,
    body:document.body.scrollWidth
  }));
  assert.ok(
    geometry.width<=geometry.viewport+2 && geometry.body<=geometry.viewport+2,
    label+": dépassement horizontal "+JSON.stringify(geometry)
  );
}
