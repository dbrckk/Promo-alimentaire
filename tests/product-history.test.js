import test from "node:test";
import assert from "node:assert/strict";
import {
  addPriceObservation,
  addStorePriceObservations,
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


test("des magasins différents ne créent pas une fausse baisse",()=>{
  let history=[];
  history=addPriceObservation(history,{
    product,store:"carrefour",observation:{price:10,date:"2026-10-01",locationId:1,storeName:"Carrefour A"},
    recordedAt:new Date("2026-10-02T12:00:00Z")
  });
  history=addPriceObservation(history,{
    product,store:"carrefour",observation:{price:5,date:"2026-10-07",locationId:2,storeName:"Carrefour B"},
    recordedAt:new Date("2026-10-08T12:00:00Z")
  });
  assert.equal(detectPriceDrops(history,{thresholdPercent:10}).length,0);
  assert.equal(productPriceTrend(history,{code:"123",store:"carrefour"}),null);
});

test("une ancienne observation revue récemment ne remplace pas la vraie chronologie",()=>{
  let history=[];
  history=addPriceObservation(history,{
    product,store:"leclerc",observation:{price:9,date:"2026-10-07",locationId:5},
    recordedAt:new Date("2026-10-07T12:00:00Z")
  });
  history=addPriceObservation(history,{
    product,store:"leclerc",observation:{price:11,date:"2026-09-01",locationId:5},
    recordedAt:new Date("2026-10-08T12:00:00Z")
  });
  const trend=productPriceTrend(history,{code:"123",store:"leclerc"});
  assert.equal(trend.latest.price,9);
  assert.equal(trend.previous.price,11);
  assert.equal(trend.direction,"down");
});

test("deux prix du même jour ne produisent pas d'alerte",()=>{
  let history=[];
  for(const [price,time] of [[10,"10:00:00"],[8,"20:00:00"]]){
    history=addPriceObservation(history,{
      product,store:"leclerc",
      observation:{price,date:"2026-10-07",locationId:5},
      recordedAt:new Date("2026-10-07T"+time+"Z")
    });
  }
  assert.equal(detectPriceDrops(history).length,0);
});

test("un prix sans magasin identifié ne peut pas déclencher d'alerte",()=>{
  const history=addPriceObservation([],{
    product,store:"carrefour",
    observation:{price:2,date:"2026-10-07",storeName:"Magasin non précisé"},
    recordedAt:new Date("2026-10-08T12:00:00Z")
  });
  assert.equal(history.length,0);
});

test("un magasin nommé avec son code postal peut être comparé",()=>{
  let history=[];
  for(const [date,price] of [["2026-10-01",10],["2026-10-07",8]]){
    history=addPriceObservation(history,{
      product,store:"carrefour",
      observation:{price,date,storeName:"Carrefour Centre",postcode:"71100"},
      recordedAt:new Date("2026-10-08T12:00:00Z")
    });
  }
  assert.equal(detectPriceDrops(history,{thresholdPercent:15}).length,1);
});


test("chaque magasin alimente son propre historique, pas seulement le prix le plus attractif de l'enseigne",()=>{
  let history=[];
  const date1=new Date("2026-10-02T12:00:00Z");
  const date2=new Date("2026-10-08T12:00:00Z");
  history=addStorePriceObservations(history,{product,store:"carrefour",recordedAt:date1,observations:[
    {locationId:11,storeName:"Carrefour A",price:10,date:"2026-10-01"},
    {locationId:22,storeName:"Carrefour B",price:8,date:"2026-10-01"}
  ]});
  history=addStorePriceObservations(history,{product,store:"carrefour",recordedAt:date2,observations:[
    {locationId:11,storeName:"Carrefour A",price:8,date:"2026-10-07"},
    {locationId:22,storeName:"Carrefour B",price:8,date:"2026-10-07"}
  ]});
  assert.equal(history.length,4);
  const alerts=detectPriceDrops(history,{thresholdPercent:15});
  assert.equal(alerts.length,1);
  assert.equal(alerts[0].storeName,"Carrefour A");
  assert.equal(alerts[0].locationKey,"id:11");
  assert.equal(alerts[0].dropPercent,20);
});

test("plusieurs prix le même jour n'entraînent pas une fausse baisse",()=>{
  let history=[];
  history=addPriceObservation(history,{product,store:"leclerc",
    observation:{locationId:5,price:10,date:"2026-10-01"},
    recordedAt:new Date("2026-10-02T12:00:00Z")});
  for(const price of [8,12]){
    history=addPriceObservation(history,{product,store:"leclerc",
      observation:{locationId:5,price,date:"2026-10-07"},
      recordedAt:new Date("2026-10-08T12:00:00Z")});
  }
  const trend=productPriceTrend(history,{code:"123",store:"leclerc",locationId:5});
  assert.equal(trend.latest.price,12);
  assert.equal(trend.direction,"up");
  assert.equal(detectPriceDrops(history).length,0);
});

test("un nom générique de chaîne avec code postal ne prouve pas l'identité du magasin",()=>{
  const generic=addStorePriceObservations([],{product,store:"carrefour",observations:[
    {price:2,date:"2026-10-07",storeName:"Carrefour",postcode:"71100"}
  ],recordedAt:new Date("2026-10-08T12:00:00Z")});
  assert.equal(generic.length,0);
});
