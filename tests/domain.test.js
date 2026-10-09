import test from "node:test";
import assert from "node:assert/strict";
import { computeSaving, effectivePercent, filterOffers, offerDeadline, rankOffers } from "../src/domain.js";

test("computeSaving calcule un pourcentage sur un prix",()=>{
  assert.equal(computeSaving({basePrice:12.5,savingPercent:40}),5);
});

test("computeSaving privilégie le montant explicite",()=>{
  assert.equal(computeSaving({basePrice:100,savingPercent:10,savingAmount:7.5}),7.5);
});

test("effectivePercent dérive un pourcentage depuis le montant",()=>{
  assert.equal(effectivePercent({basePrice:20,savingAmount:5}),25);
});

test("rankOffers trie les valeurs inconnues après les valeurs connues",()=>{
  const result=rankOffers([{id:"a",savingPercent:null},{id:"b",savingPercent:4},{id:"c",savingPercent:40}],"percent");
  assert.deepEqual(result.map((x)=>x.id),["c","b","a"]);
});

test("filterOffers filtre magasin et recherche",()=>{
  const list=[
    {title:"Mir",provider:"A",type:"ODR",category:"entretien",stores:["carrefour","leclerc"]},
    {title:"Carte cadeau",provider:"B",type:"bon",category:"panier",stores:["carrefour"]}
  ];
  assert.equal(filterOffers(list,{store:"leclerc",search:"mir"}).length,1);
  assert.equal(filterOffers(list,{store:"leclerc",search:"cadeau"}).length,0);
});


test("le registre de données reste cohérent", async()=>{
  const { providers, offers } = await import("../src/data.js");
  const providerIds=providers.map((x)=>x.id);
  const offerIds=offers.map((x)=>x.id);
  assert.equal(new Set(providerIds).size, providerIds.length, "provider ids uniques");
  assert.equal(new Set(offerIds).size, offerIds.length, "offer ids uniques");
  for(const provider of providers){
    assert.match(provider.url,/^https:\/\//);
    assert.ok(provider.stores.every((store)=>["carrefour","leclerc","all"].includes(store)));
  }
  for(const offer of offers){
    assert.match(offer.sourceUrl,/^https:\/\//);
    assert.ok(offer.stores.every((store)=>["carrefour","leclerc","all"].includes(store)));
    assert.ok(!Number.isNaN(Date.parse(offer.verifiedAt)));
  }
});


test("filterOffers respecte le canal",()=>{
  const list=[
    {title:"Magasin",provider:"A",type:"x",category:"x",stores:["carrefour"],channels:["store"]},
    {title:"Web",provider:"B",type:"x",category:"x",stores:["carrefour"],channels:["online"]},
    {title:"Tous",provider:"C",type:"x",category:"x",stores:["carrefour"]}
  ];
  assert.deepEqual(
    filterOffers(list,{store:"carrefour",channel:"store"}).map((x)=>x.title),
    ["Magasin","Tous"]
  );
});


test("offerDeadline choisit l'échéance la plus proche",()=>{
  const deadline=offerDeadline({
    expiresAt:"2026-10-31",
    reviewAfter:"2026-10-09"
  },new Date("2026-10-07T12:00:00Z"));
  assert.equal(deadline.kind,"review");
  assert.equal(deadline.daysUntil,2);
  assert.equal(deadline.urgent,true);
});

test("offerDeadline signale une expiration demain",()=>{
  const deadline=offerDeadline({
    expiresAt:"2026-10-08"
  },new Date("2026-10-07T12:00:00Z"));
  assert.equal(deadline.kind,"expires");
  assert.equal(deadline.daysUntil,1);
  assert.equal(deadline.label,"Expire demain");
});

test("offerDeadline retourne null sans échéance",()=>{
  assert.equal(offerDeadline({},new Date("2026-10-07T12:00:00Z")),null);
});


test("rankOffers peut trier par échéance la plus proche",()=>{
  const result=rankOffers([
    {id:"later",savingPercent:20,expiresAt:"2026-10-20"},
    {id:"soon",savingPercent:10,expiresAt:"2026-10-09"},
    {id:"none",savingPercent:50}
  ],"deadline",new Date("2026-10-07T12:00:00Z"));
  assert.deepEqual(result.map((x)=>x.id),["soon","later","none"]);
});

test("focus 50% ne fabrique pas de remise depuis une ODR sans pourcentage",()=>{
  const list=[
    {title:"ODR -20 %",provider:"Shopmium",category:"produit",type:"ODR",stores:["carrefour"],savingPercent:20},
    {title:"ODR -50 %",provider:"Shopmium",category:"produit",type:"ODR",stores:["carrefour"],savingPercent:50},
    {title:"Montant inconnu",provider:"Shopmium",category:"produit",type:"ODR",stores:["carrefour"],savingAmount:1}
  ];
  assert.deepEqual(filterOffers(list,{store:"carrefour",savingsFocus:"at-least-50"}).map(x=>x.title),["ODR -50 %"]);
});

test("filtre 100% cible seulement le produit remboursé, pas les bundles ou cartes",()=>{
  const sample=[
    {id:"product",title:"Défi",stores:["carrefour"],scope:"produit",mechanism:"manufacturer_refund",savingPercent:100,requiresUnlock:true},
    {id:"bundle",title:"2 achats",stores:["carrefour"],scope:"bundle",mechanism:"manufacturer_refund",savingPercent:100},
    {id:"loyalty",title:"100% cagnotte",stores:["carrefour"],scope:"produit",mechanism:"retailer_promo",savingPercent:100},
    {id:"cap",title:"30%",stores:["carrefour"],scope:"produit",mechanism:"manufacturer_refund",savingPercent:30}
  ];
  assert.deepEqual(filterOffers(sample,{store:"carrefour",savingsFocus:"full-refund"}).map(x=>x.id),["product"]);
  assert.deepEqual(filterOffers(sample,{store:"leclerc",savingsFocus:"full-refund"}),[]);
});
