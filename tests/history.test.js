import test from "node:test";
import assert from "node:assert/strict";
import { addHistoryEntry, createHistoryEntry, historyTrend } from "../src/history.js";

test("createHistoryEntry conserve un snapshot compact sans coordonnées",()=>{
  const entry=createHistoryEntry({
    shoppingList:[{product:{code:"123",name:"A"},quantity:2}],
    scenarios:[{
      store:"carrefour",isComplete:true,locationReliable:true,
      location:{name:"Carrefour Test",city:"Lyon",postcode:"69000",distanceKm:2},
      pricedCount:1,distinctCount:1,observedSubtotal:10,
      guaranteedSaving:1,finalCost:9,confidence:{score:92}
    }],
    nearbyEnabled:true,radiusKm:10,
    createdAt:new Date("2026-10-07T10:00:00Z")
  });
  assert.equal(entry.bestStore,"carrefour");
  assert.equal(entry.bestFinalCost,9);
  assert.equal(entry.products[0].quantity,2);
  assert.equal("distanceKm" in entry.scenarios[0],false);
});

test("addHistoryEntry borne et déduplique par id",()=>{
  const entry={id:"a"};
  const result=addHistoryEntry([{id:"a"},{id:"b"}],entry,{limit:2});
  assert.deepEqual(result.map((x)=>x.id),["a","b"]);
});

test("historyTrend compare les deux derniers coûts complets",()=>{
  const trend=historyTrend([
    {bestFinalCost:18},
    {bestFinalCost:20}
  ]);
  assert.equal(trend.delta,-2);
  assert.equal(trend.direction,"down");
});


test("un scénario Drive basé sur prix magasin ne crée pas de meilleur magasin",()=>{
  const entry=createHistoryEntry({
    channel:"drive",
    shoppingList:[{product:{code:"123",name:"A"},quantity:1}],
    scenarios:[{
      store:"carrefour",channel:"drive",isComplete:true,locationReliable:true,
      priceChannelReliable:false,location:{name:"Carrefour"},
      pricedCount:1,distinctCount:1,observedSubtotal:10,finalCost:9
    }],
    createdAt:new Date("2026-10-07T10:00:00Z")
  });
  assert.equal(entry.bestStore,null);
  assert.equal(entry.channel,"drive");
});
