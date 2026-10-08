import test from "node:test";
import assert from "node:assert/strict";
import {evaluateShoppingBudget,parseShoppingBudget} from "../src/budget.js";

const scenario=(checkoutCost,overrides={})=>({
  store:"carrefour",checkoutCost,
  pricedCount:2,distinctCount:2,missingCount:0,
  isComplete:true,locationReliable:true,priceChannelReliable:true,
  manualPriceCount:0,...overrides
});

test("le budget accepte les centimes français et refuse les limites invalides",()=>{
  assert.equal(parseShoppingBudget("75,50"),75.5);
  assert.equal(parseShoppingBudget(" 1 234,56 "),1234.56);
  assert.equal(parseShoppingBudget(0.01),0.01);
  for(const value of [null,"",0,-2,"abc","1,999",10000.01,Infinity]){
    assert.equal(parseShoppingBudget(value),null);
  }
});

test("un panier fiable utilise le paiement en caisse, sans retirer les ODR différées",()=>{
  const result=evaluateShoppingBudget([scenario(70,{
    deferredRefund:10,loyaltyCredit:5,finalCost:55
  })],{budget:65,channel:"store",nearbyEnabled:true});
  assert.equal(result.results[0].status,"over");
  assert.equal(result.results[0].difference,-5);
  assert.equal(result.results[0].checkoutCost,70);
});

test("un panier complet inférieur au budget reste une estimation",()=>{
  const result=evaluateShoppingBudget([scenario(48.2)],{
    budget:50,channel:"store",nearbyEnabled:true
  });
  assert.equal(result.results[0].status,"within");
  assert.equal(result.results[0].difference,1.8);
  assert.equal(result.results[0].reliable,true);
});

test("ne jamais annoncer 'budget respecté' si un produit n'a pas de prix",()=>{
  const result=evaluateShoppingBudget([scenario(20,{
    pricedCount:1,missingCount:1,isComplete:false
  })],{budget:50,channel:"store",nearbyEnabled:true});
  assert.equal(result.results[0].status,"partial-unknown");
  assert.equal(result.results[0].reliable,false);
});

test("un panier partiel déjà plus cher permet une alerte de dépassement",()=>{
  const result=evaluateShoppingBudget([scenario(70,{
    pricedCount:1,missingCount:1,isComplete:false
  })],{budget:50,channel:"store",nearbyEnabled:true});
  assert.equal(result.results[0].status,"partial-over");
  assert.equal(result.results[0].difference,-20);
});

test("les prix manuels ou Drive ne servent pas de preuve de budget suffisant",()=>{
  for(const options of [
    {channel:"drive",nearbyEnabled:true},
    {channel:"store",nearbyEnabled:false},
    {channel:"store",nearbyEnabled:true,coverageIncomplete:true}
  ]){
    const result=evaluateShoppingBudget([scenario(40)],{budget:50,...options});
    assert.equal(result.results[0].status,"indicative-within");
  }
  const manual=evaluateShoppingBudget([scenario(40,{manualPriceCount:1})],{
    budget:50,channel:"store",nearbyEnabled:true
  });
  assert.equal(manual.results[0].status,"indicative-within");
});

test("aucune observation ne produit un total fictif de zéro",()=>{
  const result=evaluateShoppingBudget([scenario(0,{
    pricedCount:0,distinctCount:3,missingCount:3,isComplete:false
  })],{budget:50,channel:"store",nearbyEnabled:true});
  assert.equal(result.results[0].status,"unavailable");
  assert.equal(result.results[0].checkoutCost,null);
});

test("les deux enseignes sont évaluées indépendamment",()=>{
  const result=evaluateShoppingBudget([
    scenario(45),
    scenario(59,{store:"leclerc"})
  ],{budget:50,channel:"store",nearbyEnabled:true});
  assert.deepEqual(result.results.map(v=>v.status),["within","over"]);
});
