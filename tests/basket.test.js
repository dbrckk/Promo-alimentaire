import test from "node:test";
import assert from "node:assert/strict";
import { compareBasketStores, evaluateBasketStore, normalizeQuantity } from "../src/basket.js";

const product={code:"3017624010701",name:"Produit test",brands:"Marque",categories:[]};
const gift={
  id:"gift",scope:"panier",stores:["carrefour"],savingPercent:4,
  autoStack:true,stackGroup:"payment",savingBasis:"current",stackOrder:30
};

test("normalizeQuantity borne la quantité",()=>{
  assert.equal(normalizeQuantity(0),1);
  assert.equal(normalizeQuantity(3.9),3);
  assert.equal(normalizeQuantity(500),99);
});

test("evaluateBasketStore calcule quantité puis remise panier",()=>{
  const scenario=evaluateBasketStore(
    [{product,quantity:2}],
    {
      store:"carrefour",
      priceByCode:{
        "3017624010701":[{price:5,date:"2026-10-01",storeName:"Carrefour"}]
      },
      offers:[gift],
      now:new Date("2026-10-07T12:00:00Z")
    }
  );
  assert.equal(scenario.observedSubtotal,10);
  assert.equal(scenario.guaranteedSaving,0.4);
  assert.equal(scenario.finalCost,9.6);
  assert.equal(scenario.isComplete,true);
});

test("une référence sans prix rend le scénario incomplet",()=>{
  const scenario=evaluateBasketStore([{product,quantity:1}],{
    store:"leclerc",priceByCode:{},offers:[],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.isComplete,false);
  assert.equal(scenario.missingCount,1);
});

test("une offre produit heuristique reste seulement potentielle",()=>{
  const offer={
    id:"candidate",scope:"produit",stores:["carrefour"],savingPercent:40,
    autoStack:false,productMatch:{brands:["Marque"]}
  };
  const scenario=evaluateBasketStore([{product,quantity:2}],{
    store:"carrefour",
    priceByCode:{"3017624010701":[{price:4,date:"2026-10-01"}]},
    offers:[offer],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.finalCost,8);
  assert.equal(scenario.guaranteedSaving,0);
  assert.equal(scenario.potentialProductSaving,3.2);
});

test("compareBasketStores privilégie un scénario complet",()=>{
  const result=compareBasketStores([
    {store:"carrefour",distinctCount:2,pricedCount:2,isComplete:true,finalCost:20},
    {store:"leclerc",distinctCount:2,pricedCount:1,isComplete:false,finalCost:8}
  ]);
  assert.equal(result[0].store,"carrefour");
});
