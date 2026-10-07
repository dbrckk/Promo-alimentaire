import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateOfferSaving,
  findProductOffers,
  matchOfferToProduct,
  normalizeText
} from "../src/matching.js";

test("normalizeText neutralise accents et ponctuation",()=>{
  assert.equal(normalizeText("X.TRA Ultra — Éco"),"x tra ultra eco");
});

test("un EAN explicite donne une correspondance exacte",()=>{
  const result=matchOfferToProduct(
    {code:"3017624010701",name:"Produit"},
    {scope:"produit",eans:["3017624010701"]}
  );
  assert.equal(result.exact,true);
  assert.equal(result.score,100);
});

test("une règle marque + mot clé produit une suggestion probable",()=>{
  const result=matchOfferToProduct(
    {code:"1",name:"Le Chat Discs 24 lavages",brands:"Le Chat",categories:[]},
    {scope:"produit",productMatch:{brands:["Le Chat"],any:["disc","discs"],minScore:60}}
  );
  assert.equal(result.matched,true);
  assert.equal(result.exact,false);
  assert.ok(result.score>=60);
});

test("une mauvaise marque est rejetée",()=>{
  const result=matchOfferToProduct(
    {name:"Lessive Discs",brands:"Autre"},
    {scope:"produit",productMatch:{brands:["Le Chat"],any:["discs"]}}
  );
  assert.equal(result.matched,false);
});

test("findProductOffers respecte l'enseigne et trie l'exact avant l'heuristique",()=>{
  const product={code:"12345678",name:"Mir liquide",brands:"Mir",categories:[]};
  const offers=[
    {id:"probable",scope:"produit",stores:["carrefour"],productMatch:{brands:["Mir"]}},
    {id:"exact",scope:"produit",stores:["carrefour"],eans:["12345678"]},
    {id:"wrong-store",scope:"produit",stores:["leclerc"],eans:["12345678"]}
  ];
  const result=findProductOffers(product,offers,{store:"carrefour"});
  assert.deepEqual(result.map((entry)=>entry.offer.id),["exact","probable"]);
});

test("estimateOfferSaving calcule un potentiel sans dépasser le prix",()=>{
  assert.equal(estimateOfferSaving(4.5,{savingPercent:40}),1.8);
  assert.equal(estimateOfferSaving(2,{savingAmount:3}),2);
});
