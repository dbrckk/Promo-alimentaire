import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {isValidGtin} from "../src/gtin.js";
import {normalizeImportedOffer} from "../src/ingestion.js";
import {selectDailyCatalogue} from "../src/daily-catalogue.js";
import {confirmPublicDailyCampaign} from "../scripts/daily-campaign-evidence.mjs";

const snapshot=JSON.parse(await readFile(
  new URL("../data/import/carrefour-promotions-auto.json",import.meta.url),"utf8"
));

test("snapshot Carrefour : EAN officiel et prix traçables",()=>{
  const ids=new Set();
  for(const offer of snapshot){
    assert.equal(ids.has(offer.externalId),false,offer.externalId);
    ids.add(offer.externalId);
    assert.equal(offer.providerId,"carrefour");
    assert.equal(offer.requiresChannelPriceVerification,true);
    assert.equal(offer.autoStack,false);
    assert.deepEqual(offer.channels,["drive","online"]);
    assert.equal(offer.eans.length,1);
    assert.ok(isValidGtin(offer.eans[0]),offer.externalId);
    const url=new URL(offer.sourceUrl);
    assert.equal(url.hostname,"www.carrefour.fr");
    assert.ok(url.pathname.endsWith("-"+offer.eans[0]),offer.externalId);
    assert.equal(offer.eanEvidenceUrl,offer.sourceUrl);
    assert.ok(offer.sourcePromoPrice>0);
    assert.ok(offer.sourceRegularPrice>offer.sourcePromoPrice);
    assert.ok(Math.abs((1-offer.sourcePromoPrice/offer.sourceRegularPrice)*100-offer.savingPercent)<1);
    assert.equal(normalizeImportedOffer(offer).ok,true,offer.externalId);
  }
});

test("les cinq nouvelles références Carrefour sont enregistrées",()=>{
  for(const code of [
    "3038359913273","3038359913297",
    "3041090767845","3041091647399","3123930715008"
  ]){
    assert.ok(snapshot.some(o=>o.eans?.includes(code)),code);
  }
});

const dailyCampaigns=JSON.parse(await readFile(
  new URL("../data/daily-campaigns.json",import.meta.url),"utf8"
)).campaigns;

test("14 octobre : campagnes Carrefour classées au taux indicatif du LOT",()=>{
  const now=new Date("2026-10-14T12:00:00Z");
  const store=selectDailyCatalogue({campaigns:dailyCampaigns,now,
    store:"carrefour",channel:"store"});
  const ids=store.campaigns.map((entry)=>entry.id);
  assert.ok(ids.includes("carrefour-bio-2eme-20261019"));
  assert.ok(ids.includes("carrefour-semaine-second-20261019"));
  assert.ok(ids.includes("carrefour-semaine-gout-20261026"));
  assert.ok(ids.includes("carrefour-raisin-red-globe-20261015"));
  assert.equal(ids.includes("carrefour-bons-plans-famille-20261016"),false);
  assert.equal(ids.includes("carrefour-promos-semaine-20261012"),false);
  const bio=store.campaigns.find((entry)=>entry.id==="carrefour-bio-2eme-20261019");
  const weekly=store.campaigns.find((entry)=>entry.id==="carrefour-semaine-second-20261019");
  const grape=store.campaigns.find((entry)=>entry.id==="carrefour-raisin-red-globe-20261015");
  assert.equal(bio.advertisedMaxPercent,60);
  assert.equal(bio.illustrativeBasketPercent,30);
  assert.equal(bio.illustrativeQuantity,2);
  assert.equal(bio.detailsUrl,"https://www.carrefour.fr/r/bio-et-ecologie");
  assert.equal(weekly.illustrativeBasketPercent,25);
  assert.equal(grape.advertisedPrice,2.99);
  assert.equal(grape.priceUnit,"kg");
  assert.equal("savingAmount" in grape,false);
  assert.equal("savingPercent" in grape,false);
  assert.ok(ids.indexOf(bio.id)<ids.indexOf(weekly.id));
  const drive=selectDailyCatalogue({campaigns:dailyCampaigns,now,
    store:"carrefour",channel:"drive"});
  assert.ok(drive.campaigns.some((entry)=>
    entry.id==="carrefour-bons-plans-famille-20261016"));
  const online=selectDailyCatalogue({campaigns:dailyCampaigns,now,
    store:"carrefour",channel:"online"});
  assert.equal(online.campaigns.length,1);
  assert.equal(online.campaigns[0].id,"carrefour-courses-en-ligne-20261108");
});

test("aucun gain inventé à partir de pourcentages publicitaires ou prix isolés",()=>{
  const now=new Date("2026-10-14T12:00:00Z");
  const baseline=dailyCampaigns.find((entry)=>
    entry.id==="carrefour-semaine-second-20261019");
  const missingPercent={...baseline,advertisedMaxPercent:undefined};
  const inventedPercent={...baseline,advertisedMaxPercent:150};
  const inventedMechanism={...baseline,offerMechanism:"automatic-stack"};
  const inventedPrice={...baseline,advertisedPrice:1.99,priceUnit:"kg"};
  const inventedLink={...baseline,
    detailsUrl:"https://www.carrefour.fr/edito/unrelated-product"};
  const phishingLink={...baseline,detailsUrl:"https://evil.example/deal"};
  const invalids=[missingPercent,inventedPercent,inventedMechanism,
    inventedPrice,inventedLink,phishingLink];
  for(const campaign of invalids){
    assert.equal(selectDailyCatalogue({campaigns:[campaign],now,
      store:"carrefour",channel:"store"}).campaigns.length,0);
  }
  const threeForTwo={...baseline,id:"three-for-two",title:"2+1 offert",
    claim:"Deux achetés et un offert sur une sélection",offerMechanism:"three-for-two",
    advertisedMaxPercent:undefined};
  const three=selectDailyCatalogue({campaigns:[threeForTwo],now,
    store:"carrefour",channel:"store"}).campaigns[0];
  assert.equal(three.illustrativeBasketPercent,33.33);
  assert.equal(three.illustrativeQuantity,3);
});

test("campagne nouvelle ne renouvelle pas une publicité dont la fin est falsifiée",()=>{
  const entry=dailyCampaigns.find((x)=>x.id==="carrefour-semaine-second-20261019");
  const page=`<img alt="Jusqu'à -50% sur le 2ème nos promos de la semaine" />
    <h2>Nos promos de la semaine</h2><p>Jusqu'au 19 octobre 2026</p>`;
  assert.equal(confirmPublicDailyCampaign(page,entry,
    new Date("2026-10-14T12:00:00Z")),true);
  assert.equal(confirmPublicDailyCampaign(page,{...entry,expiresAt:"2026-11-30"},
    new Date("2026-10-14T12:00:00Z")),false);
  assert.equal(confirmPublicDailyCampaign(
    '<h2>Nos promos de la semaine</h2><p>Jusqu’au 19 octobre 2026</p>',
    entry,new Date("2026-10-14T12:00:00Z")),false);
});
