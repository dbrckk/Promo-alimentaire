import test from "node:test";
import assert from "node:assert/strict";
import {
  compareBasketStores,
  evaluateBasketLocations,
  evaluateBasketStore,
  normalizeQuantity,
  observationLocationKey,
  selectBestLocationScenario
} from "../src/basket.js";

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


test("observationLocationKey privilégie locationId",()=>{
  assert.equal(observationLocationKey({locationId:42,storeName:"X"}),"id:42");
});

test("evaluateBasketLocations ne mélange pas deux magasins physiques",()=>{
  const items=[
    {product:{code:"1",name:"A",brands:"",categories:[]},quantity:1},
    {product:{code:"2",name:"B",brands:"",categories:[]},quantity:1}
  ];
  const priceByCode={
    "1":[
      {price:2,date:"2026-10-01",locationId:10,storeName:"Carrefour A"},
      {price:1,date:"2026-10-01",locationId:20,storeName:"Carrefour B"}
    ],
    "2":[
      {price:1,date:"2026-10-01",locationId:10,storeName:"Carrefour A"},
      {price:5,date:"2026-10-01",locationId:20,storeName:"Carrefour B"}
    ]
  };
  const scenarios=evaluateBasketLocations(items,{
    store:"carrefour",
    priceByCode,
    offers:[],
    now:new Date("2026-10-07T12:00:00Z")
  });
  const a=scenarios.find((scenario)=>scenario.location.id===10);
  const b=scenarios.find((scenario)=>scenario.location.id===20);
  assert.equal(a.finalCost,3);
  assert.equal(b.finalCost,6);
});

test("selectBestLocationScenario choisit un magasin complet avant un panier partiel moins cher",()=>{
  const best=selectBestLocationScenario([
    {isComplete:false,pricedCount:1,finalCost:2,location:{distanceKm:1}},
    {isComplete:true,pricedCount:2,finalCost:8,location:{distanceKm:5}}
  ]);
  assert.equal(best.finalCost,8);
  assert.equal(best.isComplete,true);
});


test("evaluateBasketStore expose une offre bundle comme potentiel seulement",()=>{
  const dash={code:"11111111",name:"Dash Pods",brands:"Dash",categories:[]};
  const lenor={code:"22222222",name:"Lenor",brands:"Lenor",categories:[]};
  const bundle={
    id:"bundle",scope:"bundle",stores:["carrefour"],savingPercent:100,savingCapAmount:10,
    bundleRequirements:[
      {id:"dash",minQty:1,productMatch:{brands:["Dash"]}},
      {id:"lenor",minQty:1,productMatch:{brands:["Lenor"]}}
    ],
    bundleTargetRequirementId:"lenor",autoStack:false
  };
  const scenario=evaluateBasketStore([
    {product:dash,quantity:1},
    {product:lenor,quantity:1}
  ],{
    store:"carrefour",
    priceByCode:{
      "11111111":[{price:8,date:"2026-10-01"}],
      "22222222":[{price:6,date:"2026-10-01"}]
    },
    offers:[bundle],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.finalCost,14);
  assert.equal(scenario.guaranteedSaving,0);
  assert.equal(scenario.potentialBundleSaving,6);
  assert.equal(scenario.bundleCandidates.length,1);
});
