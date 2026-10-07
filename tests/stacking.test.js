import test from "node:test";
import assert from "node:assert/strict";
import { isCompatible, optimizeStack } from "../src/stacking.js";

const gift=(id,percent)=>({
  id,stores:["carrefour"],savingPercent:percent,autoStack:true,
  stackGroup:"payment",savingBasis:"current",stackOrder:30
});

test("le moteur choisit la meilleure offre d'un même groupe",()=>{
  const result=optimizeStack(100,[gift("a",4),gift("b",3.6)],{store:"carrefour"});
  assert.equal(result.totalSaving,4);
  assert.deepEqual(result.selected.map((x)=>x.id),["a"]);
});

test("deux groupes compatibles peuvent être cumulés séquentiellement",()=>{
  const offers=[
    {id:"promo",stores:["carrefour"],savingPercent:20,autoStack:true,stackGroup:"store",savingBasis:"current",stackOrder:10},
    gift("gift",4)
  ];
  const result=optimizeStack(100,offers,{store:"carrefour"});
  assert.equal(result.totalSaving,23.2);
  assert.equal(result.finalCost,76.8);
});

test("une offre au cumul incertain n'entre pas dans le total",()=>{
  const result=optimizeStack(100,[
    gift("gift",4),
    {id:"cash",stores:["carrefour"],savingPercent:10,autoStack:false,stackGroup:"cashback"}
  ],{store:"carrefour"});
  assert.equal(result.totalSaving,4);
  assert.equal(result.considered.length,2);
});

test("le filtre magasin est respecté",()=>{
  const result=optimizeStack(50,[gift("carrefour",4)],{store:"leclerc"});
  assert.equal(result.totalSaving,0);
});

test("isCompatible refuse deux offres du même groupe",()=>{
  assert.equal(isCompatible([gift("a",4),gift("b",3)]),false);
});
