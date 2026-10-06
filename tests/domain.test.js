import test from "node:test";
import assert from "node:assert/strict";
import { computeSaving, effectivePercent, filterOffers, rankOffers } from "../src/domain.js";

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
