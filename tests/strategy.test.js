import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBasketStrategies } from "../src/strategy.js";

function scenario(store,finalCost,bestCase){
  return {
    store,distinctCount:2,isComplete:true,locationReliable:true,priceChannelReliable:true,
    finalCost,guaranteedSaving:2,conservativeBestCaseCost:bestCase,
    conservativePotentialExtraSaving:finalCost-bestCase,
    confidence:{score:90},lines:[{bestProductCandidate:{}},{bestProductCandidate:null}],
    basketOptimization:{selected:[]}
  };
}

test("le résumé distingue meilleur garanti et meilleur potentiel prudent",()=>{
  const result=summarizeBasketStrategies([
    scenario("carrefour",20,18),
    scenario("leclerc",21,16)
  ],{channel:"store",nearbyEnabled:true});
  assert.equal(result.status,"ready");
  assert.equal(result.guaranteed.store,"carrefour");
  assert.equal(result.prudent.store,"leclerc");
  assert.equal(result.sameStore,false);
});

test("le résumé refuse un gagnant en canal online",()=>{
  const result=summarizeBasketStrategies([
    scenario("carrefour",20,18)
  ],{channel:"online",nearbyEnabled:true});
  assert.equal(result.status,"indicative");
  assert.equal(result.guaranteed,undefined);
});

test("le résumé demande la proximité en magasin",()=>{
  const result=summarizeBasketStrategies([
    scenario("carrefour",20,18)
  ],{channel:"store",nearbyEnabled:false});
  assert.equal(result.status,"needs-location");
});
