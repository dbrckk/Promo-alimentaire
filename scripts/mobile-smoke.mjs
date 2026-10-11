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
  // Mixed Open Prices date formats must be ordered by actual timestamps.
  const latestReceipt=await page.evaluate(async()=>{
    const {priceCoverageSummary}=await import("./src/exact-sku-comparison.js");
    return priceCoverageSummary([
      {price:3,date:"2026-10-11T00:30:00Z"},
      {price:4,date:"2026-10-11"}
    ],new Date("2026-10-11T12:00:00Z")).latestDate;
  });
  assert.equal(latestReceipt,"2026-10-11T00:30:00Z");

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
  await page.locator("#sourceScope").selectOption("food");
  assert.match(await page.locator("#providers").innerText(),/MonAvisLeRendGratuit/);
  assert.match(await page.locator("#providers").innerText(),/HopHopFood/);
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Showroomprivé/);
  await page.locator("#sourceScope").selectOption("free-food");
  assert.match(await page.locator("#providers").innerText(),/Sampleo/);
  assert.match(await page.locator("#providers").innerText(),/The Insiders/);
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Quoty/);
  await page.locator("#sourceScope").selectOption("food-odr");
  assert.match(await page.locator("#providers").innerText(),/Quoty/);
  assert.match(await page.locator("#providers").innerText(),/Activité récente non confirmée/);
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Sampleo/);
  await page.locator("#sourceScope").selectOption("other-50");
  assert.match(await page.locator("#providers").innerText(),/Veepee/);
  assert.match(await page.locator("#providers").innerText(),/Showroomprivé/);
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Geev/);
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
  await page.locator("#barcode").fill("3017624010701");
  await page.locator('#barcodeForm button[type="submit"]').click();
  await page.locator("#productResult h2").waitFor({timeout:10000});
  assert.match(await page.locator("#productResult").innerText(),/Pâte à tartiner témoin/);
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
  assert.equal(await page.locator('[data-action="expand-exact-sku"]').count(),0,
    "Un relevé complet ne nécessite pas de recherche approfondie");
  assert.match(exactStoreCards,/0,10/);
  assert.match(exactStoreCards,/Quantité : 3 articles/);
  assert.match(exactStoreCards,/Projection pour 3 articles/);
  assert.match(exactStoreCards,/10,47/);
  assert.match(exactStoreCards,/10,77/);
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
  await context.setOffline(true);
  await page.reload({waitUntil:"domcontentloaded",timeout:25000});
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
    const {filterOffers}=await import("./src/domain.js");
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
      afterDeadline:isOfferActive(timed,new Date("2026-10-12T12:07:01Z"))
    };
  });
  assert.deepEqual(shopmiumOffline,{
    stale:false,store:0,drive:1,beforeDeadline:true,afterDeadline:false
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
