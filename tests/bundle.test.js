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
