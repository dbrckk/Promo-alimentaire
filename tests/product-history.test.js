import test from "node:test";
import assert from "node:assert/strict";
import {
  addPriceObservation,
  detectPriceDrops,
  productHistory,
  productPriceTrend
} from "../src/product-history.js";

const product={code:"123",name:"Produit"};

test("addPriceObservation déduplique le même prix source",()=>{
  const observation={price:2,date:"2026-10-07",locationId:1,storeName:"Carrefour"};
  let history=addPriceObservation([],{product,store:"carrefour",observation,recordedAt:new Date("2026-10-07T10:00:00Z")});
  history=addPriceObservation(history,{product,store:"carrefour",observation,recordedAt:new Date("2026-10-07T11:00:00Z")});
  assert.equal(history.length,1);
});

test("productPriceTrend calcule une baisse",()=>{
  let history=[];
  history=addPriceObservation(history,{
    product,store:"carrefour",
    observation:{price:3,date:"2026-10-01",locationId:1},
    recordedAt:new Date("2026-10-01T10:00:00Z")
  });
  history=addPriceObservation(history,{
    product,store:"carrefour",
    observation:{price:2.4,date:"2026-10-07",locationId:1},
    recordedAt:new Date("2026-10-07T10:00:00Z")
  });
  const trend=productPriceTrend(history,{code:"123",store:"carrefour"});
  assert.equal(trend.direction,"down");
  assert.equal(trend.delta,-0.6);
  assert.equal(trend.percent,-20);
});

test("detectPriceDrops applique le seuil",()=>{
  let history=[];
  history=addPriceObservation(history,{product,store:"leclerc",observation:{price:10,date:"2026-10-01",locationId:2},recordedAt:new Date("2026-10-01T10:00:00Z")});
  history=addPriceObservation(history,{product,store:"leclerc",observation:{price:8,date:"2026-10-07",locationId:2},recordedAt:new Date("2026-10-07T10:00:00Z")});
  assert.equal(detectPriceDrops(history,{thresholdPercent:15}).length,1);
  assert.equal(detectPriceDrops(history,{thresholdPercent:25}).length,0);
});

test("productHistory filtre par produit et enseigne",()=>{
  const history=[
    {code:"123",store:"carrefour",recordedAt:"2026-10-07T10:00:00Z"},
    {code:"123",store:"leclerc",recordedAt:"2026-10-07T09:00:00Z"},
    {code:"999",store:"carrefour",recordedAt:"2026-10-07T08:00:00Z"}
  ];
  assert.equal(productHistory(history,{code:"123",store:"carrefour"}).length,1);
});
