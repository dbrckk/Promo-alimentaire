import assert from "node:assert/strict";
import {mkdir,readFile} from "node:fs/promises";
import {chromium,devices} from "playwright";

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
      {id:1,product_code:code,price:3.49,currency:"EUR",date:"2026-10-07",
        location_id:42,location:{id:42,osm_brand:"Carrefour",
        osm_name:"Carrefour Lyon",osm_lat:45.760,osm_lon:4.84,
        osm_address_postcode:"69002",osm_address_city:"Lyon"}},
      {id:2,product_code:code,price:3.59,currency:"EUR",date:"2026-10-07",
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
  await page.locator("#priceResults").getByText("Dernier prix observé",{exact:false}).waitFor({timeout:10000});
  assert.match(await page.locator("#priceResults").innerText(),/Observation du/i);
  await page.locator('[data-action="add-current-product"]').click();
  await page.locator('[data-tab="list"]').click();
  assert.match(await page.locator("#shoppingListItems").innerText(),/Pâte à tartiner témoin/);
  assert.match(await page.locator("#listCount").textContent(),/1/);
  await page.locator("#shoppingBudget").fill("3,00");
  assert.match(await page.locator("#budgetSummary").innerText(),/Prix indisponibles/);
  await page.locator("#refreshList").click();
  await page.locator("#refreshList").waitFor({state:"visible"});
  await page.waitForFunction(()=>!document.querySelector("#refreshList").disabled,{timeout:15000});
  assert.match(await page.locator("#basketComparison").innerText(),/Relevé du/i);
  assert.match(await page.locator("#budgetSummary").innerText(),/Plafond dépassé sur les données disponibles/);
  assert.match(await page.locator("#budgetSummary").innerText(),/3,49/);
  await page.locator("#shoppingBudget").fill("6,00");
  assert.match(await page.locator("#budgetSummary").innerText(),/Sous le plafond sur les données disponibles/);
  await assertNoHorizontalOverflow(page,"liste de courses");
  await page.screenshot({path:OUT+"/02-panier.png",fullPage:true});

  // Manual shelf-price note: never a guaranteed retailer promotion.
  await page.locator("#channel").selectOption("store");
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
  await page.locator('[data-tab="list"]').click();
  assert.equal(await page.locator("#shoppingBudget").inputValue(),"6,00");
  await assertNoHorizontalOverflow(page,"mode hors ligne");
  await page.screenshot({path:OUT+"/04-hors-ligne.png",fullPage:true});
  await context.setOffline(false);

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
