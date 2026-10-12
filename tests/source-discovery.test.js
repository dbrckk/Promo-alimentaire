import test from "node:test";
import assert from "node:assert/strict";
import {providers,offers} from "../src/data.js";
import {filterDiscoveryProviders,validateDiscoveryProviders} from "../src/source-discovery.js";

test("les sources de découverte ont des IDs, preuves et liens utilisables",()=>{
  assert.deepEqual(validateDiscoveryProviders(providers),[]);
  const ids=providers.map((source)=>source.id);
  assert.equal(new Set(ids).size,ids.length);
  for(const source of providers.filter((s)=>s.discoveryVerifiedAt)){
    // New providers must not require changing a fixed whitelist of dates.
    // Validate a real civil date and reject future-dated verification claims.
    assert.match(source.discoveryVerifiedAt,/^\d{4}-\d{2}-\d{2}$/);
    const verified=new Date(source.discoveryVerifiedAt+"T00:00:00Z");
    assert.equal(verified.toISOString().slice(0,10),source.discoveryVerifiedAt);
    assert.ok(source.discoveryVerifiedAt<=new Date().toISOString().slice(0,10),
      "Une future vérification n'est pas une preuve valable.");
    assert.ok(source.verificationUrl.startsWith("https://"));
  }
});

test("l'annuaire alimentaire inclut dons, essais gratuits et enseignes tierces",()=>{
  const sources=filterDiscoveryProviders(providers,{scope:"food"});
  const ids=sources.map((s)=>s.id);
  for(const id of ["carrefour-promos-officielles","carrefour-testeurs","geev","hophopfood","lidl-plus","carte-u",
    "auchan-waaoh","intermarche-app","nous-antigaspi","trnd","home-tester-club","thefork","soliguide","linkee-etudiants","quoty","sampleo","the-insiders"]){
    assert.ok(ids.includes(id),id);
  }
  assert.equal(ids.includes("veepee"),false);
  assert.ok(sources.every((s)=>s.segment!=="other"));
});

test("hors alimentaire : seules sources annonçant au moins 50% sont consultables",()=>{
  const sources=filterDiscoveryProviders(providers,{scope:"other-50"});
  assert.deepEqual(sources.map((s)=>s.id).sort(),["showroomprive","veepee"]);
  assert.ok(sources.every((s)=>s.advertisedMaxPercent>=50));
  assert.equal(filterDiscoveryProviders([
    {id:"low",name:"Low",segment:"other",advertisedMaxPercent:49},
    {id:"unknown",name:"Unknown",segment:"other"},
    {id:"high",name:"High",segment:"other",advertisedMaxPercent:50}
  ],{scope:"other-50"}).map(x=>x.id).join(","),"high");
});

test("recherche sans accents et filtres combinés",()=>{
  assert.deepEqual(
    filterDiscoveryProviders(providers,{scope:"food",search:"solidarite"}).map(s=>s.id),
    ["hophopfood"]
  );
  assert.deepEqual(
    filterDiscoveryProviders(providers,{scope:"other-50",search:"veepee"}).map(s=>s.id),
    ["veepee"]
  );
  assert.equal(filterDiscoveryProviders(providers,{scope:"food",search:"veepee"}).length,0);
  assert.equal(filterDiscoveryProviders(providers,{scope:"unknown"}).some(s=>s.id==="showroomprive"),false);
});

test("aucune source annuaire nouvelle ne devient une fausse offre panier",()=>{
  const existingOfferProviders=new Set(offers.map((offer)=>offer.providerId));
  for(const source of providers.filter((s)=>s.discoveryVerifiedAt)){
    assert.equal(existingOfferProviders.has(source.id),false,source.id);
    assert.equal("autoStack" in source,false);
    assert.equal("savingPercent" in source,false);
  }
});

test("refuse un service non alimentaire sans seuil prouvé ou lien invalide",()=>{
  const invalid=[
    {id:"low",name:"Low",segment:"other",url:"https://example.com",verificationUrl:"https://example.com",advertisedMaxPercent:49},
    {id:"bad-url",name:"Bad",segment:"food",url:"javascript:alert(1)"},
    {id:"bad-free",name:"Bad free",segment:"food",url:"https://example.com",potentialFree:true,advertisedMaxPercent:100}
  ];
  assert.ok(validateDiscoveryProviders(invalid).length>=3);
});

test("le filtre gratuit distingue tests et dons de cashback sur ticket",()=>{
  const ids=filterDiscoveryProviders(providers,{scope:"free-food"}).map((s)=>s.id);
  for(const id of ["carrefour-testeurs","geev","hophopfood","trnd",
    "home-tester-club","sampleo","the-insiders","linkee-etudiants","soliguide"]){
    assert.ok(ids.includes(id),id);
  }
  for(const id of ["quoty","shopmium","veepee","thefork"]){
    assert.equal(ids.includes(id),false,id);
  }
});

test("le filtre remboursement liste Quoty sans le déclarer vérifié",()=>{
  const ids=filterDiscoveryProviders(providers,{scope:"food-odr"}).map((s)=>s.id);
  for(const id of ["quoty","shopmium","coupon-network","ebuyclub","belle-adresse"]){
    assert.ok(ids.includes(id),id);
  }
  assert.equal(ids.includes("sampleo"),false);
  assert.equal(ids.includes("veepee"),false);
  assert.equal(ids.includes("geev"),false);
  const quoty=providers.find((s)=>s.id==="quoty");
  assert.equal(quoty.discoveryStatus,"unconfirmed");
  assert.equal(quoty.discoveryVerifiedAt,undefined);
  assert.equal(quoty.savingPercent,undefined);
});

test("le catalogue refuse une fiche marquée vérifiée si son activité est non confirmée",()=>{
  const invalid=[{
    id:"uncertain",name:"Exemple",url:"https://example.com",
    discoveryStatus:"unconfirmed",discoveryVerifiedAt:"2026-10-09"
  }];
  assert.ok(validateDiscoveryProviders(invalid).some((msg)=>msg.includes("non confirmée")));
});

test("offres Carrefour officielles accessibles comme source sans rabais fabriqué",()=>{
  const source=providers.find((item)=>item.id==="carrefour-promos-officielles");
  assert.ok(source);
  assert.equal(source.url,"https://www.carrefour.fr/offres-du-moment");
  assert.equal(source.discoveryVerifiedAt,"2026-10-12");
  assert.equal(source.stores.includes("carrefour"),true);
  assert.equal("savingPercent" in source,false);
  assert.equal("autoStack" in source,false);
  assert.equal("expiresAt" in source,false);
  assert.equal(filterDiscoveryProviders(providers,{scope:"food",search:"carrefour"}).some(
    (item)=>item.id==="carrefour-promos-officielles"),true);
});

test("le choix de l'enseigne masque uniquement les sources du concurrent",()=>{
  const carrefour=filterDiscoveryProviders(providers,{scope:"food",store:"carrefour"});
  const leclerc=filterDiscoveryProviders(providers,{scope:"food",store:"leclerc"});
  const carrefourIds=new Set(carrefour.map((p)=>p.id));
  const leclercIds=new Set(leclerc.map((p)=>p.id));
  assert.ok(carrefourIds.has("carrefour-promos-officielles"));
  assert.ok(carrefourIds.has("carrefour-testeurs"));
  assert.ok(carrefourIds.has("carrefour"));
  assert.ok(!leclercIds.has("carrefour-promos-officielles"));
  assert.ok(!leclercIds.has("carrefour-testeurs"));
  assert.ok(!leclercIds.has("carrefour"));
  assert.ok(leclercIds.has("leclerc"));
  assert.ok(!carrefourIds.has("leclerc"));
  for(const id of ["shopmium","coupon-network","quoty","geev","hophopfood","soliguide"]){
    assert.ok(carrefourIds.has(id),"Carrefour garde "+id);
    assert.ok(leclercIds.has(id),"E.Leclerc garde "+id);
  }
  const any=filterDiscoveryProviders(providers,{scope:"food"});
  assert.ok(any.some((p)=>p.id==="carrefour-promos-officielles"));
  assert.ok(any.some((p)=>p.id==="leclerc"));
  // The store filter has no side effect on non-food 50 %+ discovery sources.
  assert.deepEqual(
    filterDiscoveryProviders(providers,{scope:"other-50",store:"leclerc"}).map((p)=>p.id),
    filterDiscoveryProviders(providers,{scope:"other-50"}).map((p)=>p.id)
  );
});

test("filtrage boutique, catégorie et recherche composés sans fausses éligibilités",()=>{
  const actual=filterDiscoveryProviders(providers,{
    scope:"food",store:"leclerc",search:"carrefour"
  }).map((provider)=>provider.id);
  assert.equal(actual.includes("carrefour-promos-officielles"),false);
  assert.equal(actual.includes("carrefour-testeurs"),false);
  const independent=filterDiscoveryProviders(providers,{
    scope:"free-food",store:"leclerc",search:"solidaire"
  });
  assert.ok(independent.every((source)=>
    !source.stores?.length || source.stores.includes("leclerc")
      || source.stores.includes("all")));
});
