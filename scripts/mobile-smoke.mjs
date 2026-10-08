import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
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
  await assertNoHorizontalOverflow(page,"page d'accueil");
  await page.screenshot({path:OUT+"/01-offres.png",fullPage:true});

  await page.locator("#channel").selectOption("drive");
  await page.locator("#sort").selectOption("deadline");
  await page.locator("#carrefourLoyalty").selectOption("club");
  assert.match(await page.locator("#loyaltySummary").innerText(),/10%/);
  await page.locator('[data-tab="product"]').click();
  await page.locator("#barcode").fill("3017624010701");
  await page.locator('#barcodeForm button[type="submit"]').click();
  await page.locator("#productResult h2").waitFor({timeout:10000});
  assert.match(await page.locator("#productResult").innerText(),/Pâte à tartiner témoin/);
  await page.locator('[data-action="add-current-product"]').click();
  await page.locator('[data-tab="list"]').click();
  assert.match(await page.locator("#shoppingListItems").innerText(),/Pâte à tartiner témoin/);
  assert.match(await page.locator("#listCount").innerText(),/1/);
  await page.locator("#refreshList").click();
  await page.locator("#refreshList").waitFor({state:"visible"});
  await page.waitForFunction(()=>!document.querySelector("#refreshList").disabled,{timeout:15000});
  await assertNoHorizontalOverflow(page,"liste de courses");
  await page.screenshot({path:OUT+"/02-panier.png",fullPage:true});

  await page.locator('[data-tab="optimizer"]').click();
  await page.locator("#basketAmount").fill("73.25");
  assert.match(await page.locator("#optimizerResult").innerText(),/73,25/);
  await assertNoHorizontalOverflow(page,"optimiseur");
  await page.screenshot({path:OUT+"/03-optimiseur.png",fullPage:true});

  await page.reload({waitUntil:"domcontentloaded"});
  assert.equal(await page.locator("#channel").inputValue(),"drive");
  assert.equal(await page.locator("#carrefourLoyalty").inputValue(),"club");
  await page.locator('[data-tab="list"]').click();
  assert.match(await page.locator("#shoppingListItems").innerText(),/Pâte à tartiner témoin/);

  const swSupported=await page.evaluate(()=>"serviceWorker" in navigator);
  assert.equal(swSupported,true,"Service worker unavailable in browser context");
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),{timeout:20000});
  await context.setOffline(true);
  await page.reload({waitUntil:"domcontentloaded",timeout:25000});
  await page.locator("#stats .stat").first().waitFor({timeout:12000});
  assert.match(await page.locator("h1").innerText(),/Promo Alimentaire/);
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
