import test from "node:test";
import assert from "node:assert/strict";
import { addHistoryEntry, basketContentSignature, createHistoryEntry, historyTrend } from "../src/history.js";

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

test("historyTrend compare uniquement les mêmes paniers et magasins",()=>{
  const make=(date,price,quantity=1,locationId=42,channel="store")=>createHistoryEntry({
    channel,nearbyEnabled:true,radiusKm:25,createdAt:new Date(date),
    shoppingList:[{product:{code:"123",name:"A"},quantity}],
    scenarios:[{
      store:"carrefour",channel,isComplete:true,locationReliable:true,
      priceChannelReliable:channel==="store",
      location:{id:locationId,name:"Carrefour",postcode:"69000"},
      pricedCount:1,distinctCount:1,observedSubtotal:price,
      finalCost:price
    }]
  });
  const latest=make("2026-10-08T12:00:00Z",18);
  const same=make("2026-10-07T12:00:00Z",20);
  const differentBasket=make("2026-10-07T13:00:00Z",3,2);
  const differentStore=make("2026-10-07T14:00:00Z",4,1,99);
  const differentChannel=make("2026-10-07T15:00:00Z",1,1,42,"drive");
  const trend=historyTrend([latest,differentBasket,differentStore,differentChannel,same]);
  assert.equal(trend.delta,-2);
  assert.equal(trend.direction,"down");
  assert.equal(trend.locationKey,"id:42");
  assert.equal(historyTrend([latest,differentBasket,differentStore,differentChannel]),null);
  assert.equal(historyTrend([{bestFinalCost:18},{bestFinalCost:20}]),null);
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


test("basketContentSignature ne change pas avec l'ordre et additionne les doublons",()=>{
  const p=(code,quantity)=>({product:{code},quantity});
  assert.equal(basketContentSignature([p("A",1),p("B",2),p("A",2)]),"Ax3|Bx2");
  assert.equal(basketContentSignature([p("B",2),p("A",3)]),"Ax3|Bx2");
  assert.notEqual(basketContentSignature([p("A",1)]),basketContentSignature([p("A",2)]));
});

test("une comparaison sans rayon ni magasin stable reste sans tendance",()=>{
  const input={
    shoppingList:[{product:{code:"123"},quantity:1}],
    scenarios:[{
      store:"carrefour",isComplete:true,locationReliable:true,
      location:{name:"Carrefour Centre",postcode:"69000"},finalCost:10
    }],
    nearbyEnabled:false,createdAt:new Date("2026-10-08T12:00:00Z")
  };
  const entry=createHistoryEntry(input);
  assert.equal(entry.contextKey,null);
  assert.equal(historyTrend([entry,entry]),null);
});

test("des entrées de panier sans numéro de magasin ou code postal ne font pas une tendance",()=>{
  const input={
    shoppingList:[{product:{code:"123"},quantity:1}],
    scenarios:[{
      store:"carrefour",isComplete:true,locationReliable:true,
      location:{name:"Carrefour"},finalCost:10
    }],
    nearbyEnabled:true,radiusKm:25,createdAt:new Date("2026-10-08T12:00:00Z")
  };
  const entry=createHistoryEntry(input);
  assert.equal(entry.bestStore,null);
  assert.equal(entry.contextKey,null);
});
