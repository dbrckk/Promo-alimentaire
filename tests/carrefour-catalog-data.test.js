import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {isValidGtin} from "../src/gtin.js";
import {normalizeImportedOffer} from "../src/ingestion.js";
import {selectDailyCatalogue,dailyCampaignRefreshNotice} from "../src/daily-catalogue.js";
import {confirmPublicDailyCampaign,discoverCarrefourDailyLeads,discoverCarrefourFoodBrochures,retainRecentDailyLeads,dailyCampaignSourceUrls} from "../scripts/daily-campaign-evidence.mjs";

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
  // Unlike a vague maximum marketing rate, a named €/kg food spot is
  // actionable as a unit-price observation, but never a priced whole basket.
  assert.deepEqual(store.priceSpots.map((item)=>item.id),
    ["carrefour-raisin-red-globe-20261015"]);
  assert.equal(store.priceSpots[0].advertisedPrice,2.99);
  assert.equal("upfrontCost" in store.priceSpots[0],false);
  assert.equal("savingAmount" in store.priceSpots[0],false);
  const lowBudget=selectDailyCatalogue({campaigns:dailyCampaigns,now,
    store:"carrefour",channel:"store",maxSpend:3,limit:1});
  assert.equal(lowBudget.priceSpots[0].priceUnit,"kg",
    "Même une seule carte générale ne doit masquer un prix de fruit nommé");
  assert.equal("affordable" in lowBudget.priceSpots[0],false,
    "2,99 €/kg ne prouve jamais qu'un achat de poids inconnu coûte 2,99 €");
  assert.equal(selectDailyCatalogue({campaigns:dailyCampaigns,
    now:new Date("2026-10-15T22:00:00Z"),store:"carrefour",
    channel:"store"}).priceSpots.length,0,
    "Prix expiré dès minuit civil Paris (16 octobre)");
  assert.equal(selectDailyCatalogue({campaigns:dailyCampaigns,now,
    store:"leclerc",channel:"store"}).priceSpots.length,0,
    "Ne jamais attribuer un prix Carrefour à E.Leclerc");
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

test("le coût après avantage classe les produits sans masquer l'argent à avancer",()=>{
  const base={category:"alimentaire",scope:"produit",stores:["leclerc"],
    channels:["store"],verifiedAt:"2026-10-14",reviewAfter:"2026-10-17",
    expiresAt:"2026-10-17",sourceUrl:"https://www.e.leclerc/prospectus"};
  const offers=[
    {...base,id:"ticket",providerId:"leclerc",title:"Ticket fidélité",
      basePrice:4,savingPercent:20,mechanism:"retailer_loyalty",
      rewardType:"loyalty_credit"},
    {...base,id:"free-after-refund",providerId:"shopmium",title:"Remboursé après achat",
      basePrice:5,savingPercent:100,mechanism:"manufacturer_refund"},
    {...base,id:"affordable",providerId:"shopmium",title:"Coupon accessible",
      basePrice:3,savingAmount:1,mechanism:"manufacturer_refund"},
    {...base,id:"unknown-price",providerId:"shopmium",title:"Prix non documenté",
      savingAmount:1,mechanism:"manufacturer_refund"}
  ];
  const now=new Date("2026-10-14T12:00:00Z");
  const all=selectDailyCatalogue({offers,store:"leclerc",
    channel:"store",now,sort:"net",limit:10});
  assert.deepEqual(all.highlights.map((item)=>item.id),[
    "free-after-refund","affordable","ticket"
  ]);
  assert.deepEqual(all.highlights.map((item)=>item.netAfterBenefit),[0,2,3.2]);
  assert.equal(all.extra.find((item)=>item.id==="unknown-price").netAfterBenefit,null);
  const fullyRefunded=all.extra.find((item)=>item.id==="free-after-refund");
  assert.equal(fullyRefunded.upfrontCost,5,
    "100 % remboursé ne signifie pas payer 0 € en caisse");
  assert.equal(fullyRefunded.netAfterBenefit,0);
  const budget=selectDailyCatalogue({offers,store:"leclerc",
    channel:"store",now,sort:"net",maxSpend:3,limit:10});
  assert.deepEqual(budget.highlights.map((item)=>item.id),["affordable"]);
  assert.equal(budget.retailer.length,0);
  assert.equal(budget.extra.length,1);
  const pending=selectDailyCatalogue({offers:[{
    ...offers[0],sourceSyncWarning:{
      status:"unavailable",checkedAt:"2026-10-14T11:00:00Z"}
  }],store:"leclerc",channel:"store",now,sort:"net"});
  assert.equal(pending.highlights.length,0);
  assert.equal(pending.unconfirmed[0]?.netAfterBenefit,null);
});

test("catalogue alimentaire du jour : dates réelles et lien officiel sans fausse remise",()=>{
  const html=`<main><h2>Catalogues du moment</h2>
    <p>AU COEUR DU GOÛT Du 13 oct. au 26 oct. 2026</p>
    <p>PRÊT À JOUER AVEC NOUS ? Du 13 oct. au 07 déc. 2026</p>
    <p>LE CHEF C'EST MOI 2 Du 13 oct. au 26 oct. 2026</p>
    <h2>Catalogues bientôt disponibles</h2>
    <p>Le mois MONOPOLY produits laitiers Du 20 oct. au 30 oct. 2026</p>
  </main>`;
  const now=new Date("2026-10-14T11:00:00Z");
  const leads=discoverCarrefourFoodBrochures(html,now);
  assert.equal(leads.length,1);
  const lead=leads[0];
  assert.equal(lead.id,"carrefour-public-lead-brochure-au-coeur-du-gout-20261014");
  assert.equal(lead.sourceUrl,"https://www.carrefour.fr/catalogue/carrefour");
  assert.equal(lead.verifiedAt,"2026-10-14");
  assert.equal(lead.expiresAt,"2026-10-14",
    "Le prospectus peut durer deux semaines, mais la preuve est datée du jour");
  assert.match(lead.claim,/2026-10-13 au 2026-10-26/);
  for(const forbidden of ["eans","savingAmount","savingPercent","basePrice","autoStack"]){
    assert.equal(forbidden in lead,false,forbidden);
  }
  assert.equal(selectDailyCatalogue({campaigns:leads,store:"carrefour",
    channel:"store",now}).campaigns.length,1);
  assert.equal(selectDailyCatalogue({campaigns:leads,store:"carrefour",
    channel:"drive",now}).campaigns.length,0);
  assert.equal(selectDailyCatalogue({campaigns:leads,store:"carrefour",
    channel:"store",now:new Date("2026-10-14T22:00:00Z")}).campaigns.length,0);
  assert.deepEqual(discoverCarrefourFoodBrochures(html,
    new Date("2026-10-27T12:00:00Z")),[],
    "Une brochure terminée n'est plus une proposition du jour");
  assert.deepEqual(discoverCarrefourFoodBrochures("<html>403 Access denied</html>",now),[]);
});

test("le contrôle des prospectus interdit les fausses dates et les campagnes hors alimentaire",()=>{
  const now=new Date("2026-10-14T11:00:00Z");
  const html=`<h2>Catalogues du moment</h2>
    <p>AU COEUR DU GOÛT Du 13 oct. au 31 sept. 2026</p>
    <p>TOUTES EN BEAUTÉ Du 06 oct. au 19 oct. 2026</p>
    <p>LE MOIS MONOPOLY PRODUITS LAITIERS Du 20 oct. au 30 oct. 2026</p>
    <h2>Magazines</h2>`;
  assert.deepEqual(discoverCarrefourFoodBrochures(html,now),[],
    "Mois impossible, non alimentaire et campagne future exclus");
  const tiny=`<h2>Catalogues du moment</h2>
    <p>AU COEUR DU GOÛT</p>
    <p>TOUTES EN BEAUTÉ Du 13 oct. au 26 oct. 2026</p>
    <h2>Magazines</h2>`;
  assert.deepEqual(discoverCarrefourFoodBrochures(tiny,now),[],
    "La période d'un autre prospectus ne peut servir de preuve");
});

test("petits prix alimentaires : sélectionner les annonces sans présumer d'un EAN ou panier",()=>{
  const page=`<img alt="Produits du quotidien à moins de 1 euro"/>
    <h3>Les produits du quotidien à moins de 1€</h3>
    <p>En Hypermarché et en Drive</p>
    <img alt="Recettes à petits prix"/>
    <h3>Recettes à petits prix</h3>
    <p>En Hypermarché et en Drive</p>`;
  const now=new Date("2026-10-14T11:00:00Z");
  const leads=discoverCarrefourDailyLeads(page,now);
  assert.deepEqual(leads.map((x)=>x.id),[
    "carrefour-public-lead-quotidien-1-20261014",
    "carrefour-public-lead-recettes-budget-20261014"
  ]);
  const selected=selectDailyCatalogue({campaigns:leads,now,
    store:"carrefour",channel:"store",maxSpend:3});
  assert.equal(selected.campaigns.length,2);
  assert.ok(selected.campaigns.every((x)=>x.advertisedPrice===null
    && !("savingAmount" in x) && !("savingPercent" in x)),
  "Pas de prix exact ni de gain automatique sur une simple sélection publicitaire");
});

test("petits budgets : nouveautés Carrefour visibles en premier sans prix de caisse inventé",()=>{
  const date=new Date("2026-10-14T12:00:00Z");
  const source="https://www.carrefour.fr/offres-du-moment";
  const html=`<main>
    <img alt="Fruits et légumes à moins de 1 euro" />
    <h3>Fruits et légumes à 0,99€</h3><p>En Hypermarché et en Drive</p>
    <img alt="Produits du quotidien à moins de 1 euro" />
    <h3>Les produits du quotidien à moins de 1€</h3><p>En Hypermarché et en Drive</p>
    <img alt="Bio à moins de 2 euros" />
    <h3>Le Bio à moins de 2€</h3><p>En Hypermarché et en Drive</p>
  </main>`;
  const leads=discoverCarrefourDailyLeads(html,date);
  assert.deepEqual(leads.map(x=>x.id),[
    "carrefour-public-lead-legumes-099-20261014",
    "carrefour-public-lead-quotidien-1-20261014",
    "carrefour-public-lead-bio-2-20261014"
  ]);
  const essentials=leads.find(x=>x.id.includes("quotidien-1"));
  assert.equal(essentials.sourceUrl,source);
  assert.equal(essentials.detailsUrl,"https://www.carrefour.fr/boutique/produits-1euro");
  assert.equal("savingPercent" in essentials,false);
  assert.equal("savingAmount" in essentials,false);
  assert.equal("advertisedPrice" in essentials,false);
  const raw=dailyCampaigns.filter(x=>x.store==="carrefour"
    && !x.id.startsWith("carrefour-public-lead-"));
  const ranked=selectDailyCatalogue({
    campaigns:[...raw,...leads],now:date,
    store:"carrefour",channel:"store",maxSpend:3,limit:3
  });
  assert.deepEqual(ranked.campaigns.map(x=>x.id),leads.map(x=>x.id),
    "Un catalogue volumineux ne masque plus les petits prix annoncés");
  assert.ok(ranked.campaigns.every(x=>x.advertisedPrice===null
    && !("savingAmount" in x) && !("savingPercent" in x)));
  const tampered=selectDailyCatalogue({
    campaigns:[{...essentials,detailsUrl:"https://example.invalid/discount"}],
    now:date,store:"carrefour",channel:"store"
  });
  assert.equal(tampered.campaigns.length,0);
  const expired=selectDailyCatalogue({
    campaigns:leads,now:new Date("2026-10-14T22:00:00Z"),
    store:"carrefour",channel:"store",maxSpend:3
  });
  assert.equal(expired.campaigns.length,0);
});

test("les deux portes d'entrée Carrefour sont contrôlées même après expiration de toutes les anciennes campagnes",()=>{
  const urls=dailyCampaignSourceUrls([
    {sourceUrl:"https://www.carrefour.fr/offres-du-moment",
      expiresAt:"2026-10-14"},
    {sourceUrl:"https://nos-catalogues-promos-v2.e.leclerc/catalog/26G133G/0637",
      expiresAt:"2026-10-17"}
  ],"2026-10-15");
  assert.deepEqual(urls,[
    "https://www.carrefour.fr/catalogue/carrefour",
    "https://www.carrefour.fr/offres-du-moment",
    "https://nos-catalogues-promos-v2.e.leclerc/catalog/26G133G/0637"
  ]);
  assert.deepEqual(dailyCampaignSourceUrls([],"2026-11-15"),urls.slice(0,2));
  assert.deepEqual(dailyCampaignSourceUrls([
    {sourceUrl:"https://example.com/old",expiresAt:"not-a-day"},
    {sourceUrl:"https://example.com/expired",expiresAt:"2026-10-12"}
  ],"2026-10-15"),urls.slice(0,2));
});

test("Android distingue une preuve datée d'une collecte Carrefour refusée le jour même",()=>{
  const now=new Date("2026-10-15T12:00:00Z");
  const base={
    checkedAt:"2026-10-14T09:13:29Z",
    lastAttemptAt:"2026-10-15T08:00:00Z"
  };
  const blocked=dailyCampaignRefreshNotice({...base,sourceChecks:{
    "https://www.carrefour.fr/catalogue/carrefour":{status:"unavailable",reason:"HTTP 403"},
    "https://www.carrefour.fr/offres-du-moment":{status:"unavailable",reason:"HTTP 403"}
  }},"carrefour",now);
  assert.match(blocked,/lecture automatique.*indisponible/i);
  assert.match(blocked,/2026-10-14/);
  assert.doesNotMatch(blocked,/consultée.*aujourd'hui/i);
  const partial=dailyCampaignRefreshNotice({...base,sourceChecks:{
    "https://www.carrefour.fr/catalogue/carrefour":{status:"unavailable"},
    "https://www.carrefour.fr/offres-du-moment":{status:"available"}
  }},"carrefour",now);
  assert.match(partial,/partielle/i);
  const available=dailyCampaignRefreshNotice({...base,sourceChecks:{
    "https://www.carrefour.fr/catalogue/carrefour":{status:"available"},
    "https://www.carrefour.fr/offres-du-moment":{status:"available"}
  }},"carrefour",now);
  assert.match(available,/sans garantie de prix local/i);
  const old=dailyCampaignRefreshNotice({...base,
    lastAttemptAt:"2026-10-14T09:00:00Z"},"carrefour",now);
  assert.match(old,/aucun contrôle automatique.*2026-10-15/i);
  const missing=dailyCampaignRefreshNotice({},"leclerc",now);
  assert.match(missing,/aucun contrôle automatique/i);
  const wrongVendor=dailyCampaignRefreshNotice({...base,sourceChecks:{
    "https://www.carrefour.fr/catalogue/carrefour":{status:"available"}
  }},"leclerc",now);
  assert.match(wrongVendor,/aucune lecture de source officielle/i);
});
