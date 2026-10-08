import test from "node:test";
import assert from "node:assert/strict";
import {providers,offers} from "../src/data.js";
import {filterDiscoveryProviders,validateDiscoveryProviders} from "../src/source-discovery.js";

test("les sources de découverte ont des IDs, preuves et liens utilisables",()=>{
  assert.deepEqual(validateDiscoveryProviders(providers),[]);
  const ids=providers.map((source)=>source.id);
  assert.equal(new Set(ids).size,ids.length);
  for(const source of providers.filter((s)=>s.discoveryVerifiedAt)){
    assert.match(source.discoveryVerifiedAt,/^2026-10-(?:08|09)$/);
    assert.ok(source.verificationUrl.startsWith("https://"));
  }
});

test("l'annuaire alimentaire inclut dons, essais gratuits et enseignes tierces",()=>{
  const sources=filterDiscoveryProviders(providers,{scope:"food"});
  const ids=sources.map((s)=>s.id);
  for(const id of ["carrefour-testeurs","geev","hophopfood","lidl-plus","carte-u",
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
