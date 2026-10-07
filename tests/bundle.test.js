import test from "node:test";
import assert from "node:assert/strict";
import { estimateBundleSaving, findBundleCandidates, matchBundle } from "../src/bundle.js";

const dash={product:{code:"1",name:"Dash Pods",brands:"Dash",categories:[]},quantity:1};
const lenor={product:{code:"2",name:"Lenor Adoucissant",brands:"Lenor",categories:[]},quantity:1};
const offer={
  id:"envie-dash-lenor",scope:"bundle",stores:["all"],savingPercent:100,savingCapAmount:10,
  bundleRequirements:[
    {id:"dash",minQty:1,productMatch:{brands:["Dash"]}},
    {id:"lenor",minQty:1,productMatch:{brands:["Lenor"]}}
  ],
  bundleTargetRequirementId:"lenor"
};

test("matchBundle exige Dash et Lenor",()=>{
  assert.equal(matchBundle([dash,lenor],offer).matched,true);
  assert.equal(matchBundle([dash],offer).matched,false);
});

test("estimateBundleSaving rembourse la cible à 100% avec plafond",()=>{
  const lines=[
    {product:dash.product,bestPrice:{price:8},missingPrice:false},
    {product:lenor.product,bestPrice:{price:12},missingPrice:false}
  ];
  const result=estimateBundleSaving([dash,lenor],lines,offer);
  assert.equal(result.saving,10);
});

test("estimateBundleSaving renvoie null si la cible n'a pas de prix",()=>{
  const lines=[
    {product:dash.product,bestPrice:{price:8},missingPrice:false},
    {product:lenor.product,bestPrice:null,missingPrice:true}
  ];
  assert.equal(estimateBundleSaving([dash,lenor],lines,offer),null);
});

test("findBundleCandidates filtre l'enseigne",()=>{
  const lines=[
    {product:dash.product,bestPrice:{price:8},missingPrice:false},
    {product:lenor.product,bestPrice:{price:4},missingPrice:false}
  ];
  const onlyCarrefour={...offer,stores:["carrefour"]};
  assert.equal(findBundleCandidates([dash,lenor],lines,[onlyCarrefour],{store:"carrefour"}).length,1);
  assert.equal(findBundleCandidates([dash,lenor],lines,[onlyCarrefour],{store:"leclerc"}).length,0);
});


test("findBundleCandidates respecte le canal",()=>{
  const items=[
    {product:{code:"1",name:"Dash",brands:"Dash",categories:[]},quantity:1},
    {product:{code:"2",name:"Lenor",brands:"Lenor",categories:[]},quantity:1}
  ];
  const lines=[
    {product:items[0].product,bestPrice:{price:8},missingPrice:false},
    {product:items[1].product,bestPrice:{price:4},missingPrice:false}
  ];
  const webOffer={
    ...offer,
    id:"web",
    stores:["carrefour"],
    channels:["online"]
  };
  assert.equal(findBundleCandidates(items,lines,[webOffer],{store:"carrefour",channel:"store"}).length,0);
  assert.equal(findBundleCandidates(items,lines,[webOffer],{store:"carrefour",channel:"online"}).length,1);
});


test("un bundle reste non chiffrable si un article obligatoire n'a pas de prix",()=>{
  const items=[
    {product:{code:"a",name:"Dash",brands:"Dash",categories:[]},quantity:1},
    {product:{code:"b",name:"Lenor",brands:"Lenor",categories:[]},quantity:1}
  ];
  const offer={
    id:"b",scope:"bundle",stores:["carrefour"],
    savingPercent:100,bundleTargetRequirementId:"lenor",
    bundleRequirements:[
      {id:"dash",minQty:1,productMatch:{brands:["Dash"]}},
      {id:"lenor",minQty:1,productMatch:{brands:["Lenor"]}}
    ]
  };
  const lines=[
    {product:items[0].product,missingPrice:true,bestPrice:null},
    {product:items[1].product,missingPrice:false,bestPrice:{price:4}}
  ];
  assert.equal(findBundleCandidates(items,lines,[offer],{store:"carrefour"}).length,0);
});
