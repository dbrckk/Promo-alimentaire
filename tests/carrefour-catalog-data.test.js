import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {isValidGtin} from "../src/gtin.js";
import {normalizeImportedOffer} from "../src/ingestion.js";
import {selectDailyCatalogue} from "../src/daily-catalogue.js";
import {confirmPublicDailyCampaign,discoverCarrefourDailyLeads,retainRecentDailyLeads} from "../scripts/daily-campaign-evidence.mjs";

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
    advertisedMaxPercent:undefined,detailsUrl:undefined};
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

test("détecter les nouveautés alimentaires du jour sans créer de prix EAN",()=>{
  const page=`<section>
    <img alt="Fruits et légumes à moins de 1 euro" />
    <h3>Fruits et légumes à 0,99€</h3><p>En Hypermarché et en Drive</p>
    <img alt="Bio à moins de 2 euros" />
    <h3>Le Bio à moins de 2€</h3><p>En Hypermarché et en Drive.</p>
    <img alt="34% d'économies Club dès 15€ d'achat sur la poissonnerie Exclu Drive" />
    <h3>34% d'économies dès 15€ d'achat sur une sélection du rayon poissonnerie (hors promotion)</h3>
    <p>Aujourd'hui uniquement</p>
    <p>Exclusivement dans les Drive participants.</p>
    </section>`;
  const date=new Date("2026-10-14T12:00:00Z");
  const leads=discoverCarrefourDailyLeads(page,date);
  assert.deepEqual(leads.map((item)=>item.id),[
    "carrefour-public-lead-legumes-099-20261014",
    "carrefour-public-lead-bio-2-20261014",
    "carrefour-public-lead-poissonnerie-club-15-20261014"
  ]);
  assert.ok(leads.every((item)=>item.verifiedAt==="2026-10-14"
    && item.expiresAt==="2026-10-14"
    && !("savingAmount" in item) && !("savingPercent" in item)
    && !("autoStack" in item) && !("eans" in item)));
  const inStore=selectDailyCatalogue({campaigns:leads,now:date,
    store:"carrefour",channel:"store"});
  assert.equal(inStore.campaigns.length,2);
  assert.equal(inStore.campaigns.some((item)=>item.minimumPurchase===15),false);
  const drive=selectDailyCatalogue({campaigns:leads,now:date,
    store:"carrefour",channel:"drive"});
  assert.equal(drive.campaigns.length,3);
  assert.equal(drive.campaigns.find((item)=>item.minimumPurchase===15)?.advertisedMaxPercent,null);
  const budget=selectDailyCatalogue({campaigns:leads,now:date,
    store:"carrefour",channel:"drive",maxSpend:3});
  assert.equal(budget.campaigns.length,2,
    "Un avantage Club exigeant 15 € d'achat ne peut pas être un bon plan à 3 €");
  assert.equal(selectDailyCatalogue({campaigns:leads,now:date,
    store:"carrefour",channel:"drive",maxSpend:20}).campaigns.length,3);
  const tomorrow=selectDailyCatalogue({campaigns:leads,
    now:new Date("2026-10-14T22:00:00Z"),store:"carrefour",channel:"drive"});
  assert.equal(tomorrow.campaigns.length,0);
});

test("aucune nouvelle fiche si preuve officielle absente ou programme hors alimentaire",()=>{
  const date=new Date("2026-10-14T12:00:00Z");
  const incomplete=`<img alt="Fruits et légumes à moins de 1 euro" />
    <h3>Fruits et légumes à 0,99€</h3>
    <img alt="Bio à moins de 2 euros"/>
    <h3>Le Bio à moins de 2€</h3>
    <img alt="34% d'économies Club dès 15€ d'achat sur la poissonnerie Exclu Drive"/>
    <h3>34% d'économies dès 15€ d'achat sur une sélection du rayon poissonnerie (hors promotion)</h3>
    <p>Valable prochainement</p>`;
  assert.deepEqual(discoverCarrefourDailyLeads(incomplete,date),[]);
  assert.deepEqual(discoverCarrefourDailyLeads(
    "<html>Access denied CAPTCHA</html>",date),[]);
  const falseLead={
    id:"budget-invalid",store:"carrefour",channels:["drive"],category:"alimentaire",
    title:"Bon plan en magasin",claim:"Aucune condition chiffrée",
    startsAt:"2026-10-14",expiresAt:"2026-10-14",
    verifiedAt:"2026-10-14",sourceUrl:"https://www.carrefour.fr/offres-du-moment",
    minimumPurchase:15
  };
  assert.equal(selectDailyCatalogue({campaigns:[falseLead],now:date,
    store:"carrefour",channel:"drive"}).campaigns.length,0);
});

test("un refus HTTP 403 ne supprime pas une piste vérifiée le même jour",()=>{
  const today="2026-10-14";
  const lead=dailyCampaigns.find((x)=>x.id===
    "carrefour-public-lead-legumes-099-20261014");
  assert.ok(lead);
  const retained=retainRecentDailyLeads([lead],today);
  assert.deepEqual(retained,[lead]);
  assert.equal(selectDailyCatalogue({campaigns:retained,
    now:new Date("2026-10-14T21:59:59Z"),store:"carrefour",channel:"store"
  }).campaigns.length,1);
  assert.equal(selectDailyCatalogue({campaigns:retained,
    now:new Date("2026-10-14T22:00:00Z"),store:"carrefour",channel:"store"
  }).campaigns.length,0,
    "Une offre de la veille ne revient pas même si elle reste archivée");
  assert.equal(retainRecentDailyLeads([lead],"2026-10-20").length,1);
  assert.equal(retainRecentDailyLeads([lead],"2026-10-22").length,0);
  assert.equal(retainRecentDailyLeads([{...lead,verifiedAt:"2026-10-13"}],
    today).length,0,"Pas de preuve d'une autre journée présentée comme preuve du jour");
  assert.equal(retainRecentDailyLeads([{...lead,expiresAt:"2026-10-15"}],
    today).length,0,"Aucune prolongation de campagne sans nouvelle preuve");
});
