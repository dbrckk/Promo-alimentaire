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

test("un relevé du jour après minuit à Paris n'est pas daté dans le futur",()=>{
  const cases=[
    // 00:20 en France, été (+02), hiver (+01) et changements d'heure.
    ["2026-10-12T22:20:00Z","2026-10-13"],
    ["2027-01-01T23:20:00Z","2027-01-02"],
    ["2026-03-29T22:20:00Z","2026-03-30"],
    ["2026-10-25T23:20:00Z","2026-10-26"]
  ];
  for(const [instant,day] of cases){
    const now=new Date(instant);
    const history=addPriceObservation([],{
      product,store:"carrefour",
      observation:{locationId:42,price:1.79,date:day,storeName:"Carrefour"},
      recordedAt:now
    });
    assert.equal(history.length,1,instant);
    assert.equal(history[0].date,day);
    // A genuinely later French day still must be rejected.
    const tomorrow=new Date(day+"T12:00:00Z");
    tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
    assert.equal(addPriceObservation([],{
      product,store:"carrefour",
      observation:{locationId:42,price:1.79,
        date:tomorrow.toISOString().slice(0,10)},
      recordedAt:now
    }).length,0,instant);
  }
});

test("les baisses de prix sont détectées à minuit Paris sans faux futur",()=>{
  const now=new Date("2026-10-12T22:20:00Z"); // 13 octobre 00:20 en France
  let history=[];
  for(const [date,price] of [["2026-10-12",10],["2026-10-13",8]]){
    history=addPriceObservation(history,{
      product,store:"leclerc",
      observation:{locationId:8,storeName:"E.Leclerc Dijon",date,price},
      recordedAt:now
    });
  }
  assert.equal(history.length,2);
  assert.equal(productPriceTrend(history,{code:"123",store:"leclerc"})?.direction,"down");
  const alerts=detectPriceDrops(history,{
    now,thresholdPercent:15,maxAgeDays:7
  });
  assert.equal(alerts.length,1);
  assert.equal(alerts[0].dropPercent,20);
  assert.equal(alerts[0].date,"2026-10-13");
});

test("les dates impossibles ou les timestamps malformés ne polluent pas l'historique",()=>{
  for(const date of ["2026-02-30","2026-13-01","2026-10-12T25:20:00Z",
    "2026-10-12T23:00:00","hier"]){
    const entries=addPriceObservation([],{
      product,store:"carrefour",
      observation:{locationId:1,price:2,date},
      recordedAt:new Date("2026-10-13T10:00:00Z")
    });
    assert.equal(entries.length,0,date);
  }
});

test("le même jour civil Paris reste un seul niveau de prix historique",()=>{
  const historical=[
    {code:"123",store:"carrefour",price:10,locationId:91,
      date:"2026-10-12",storeName:"Carrefour Lyon"},
    {code:"123",store:"carrefour",price:8,locationId:91,
      date:"2026-10-12T22:20:00Z",storeName:"Carrefour Lyon"},
    {code:"123",store:"carrefour",price:9,locationId:91,
      date:"2026-10-13T08:00:00Z",storeName:"Carrefour Lyon"}
  ];
  const trend=productPriceTrend(historical,{code:"123",store:"carrefour"});
  assert.equal(trend.latest.price,9,
    "Deux relevés du 13/10 à Paris doivent utiliser le plus haut prix");
  assert.equal(trend.previous.price,10);
  assert.equal(trend.direction,"down");
});
