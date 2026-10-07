import test from "node:test";
import assert from "node:assert/strict";
import { scoreBasketConfidence } from "../src/confidence.js";

test("scoreBasketConfidence valorise couverture fraîcheur magasin et preuve",()=>{
  const scenario={
    distinctCount:2,pricedCount:2,locationReliable:true,locationKey:"id:42",
    lines:[
      {missingPrice:false,bestPrice:{date:"2026-10-05",proofType:"RECEIPT"}},
      {missingPrice:false,bestPrice:{date:"2026-10-01",proofType:"RECEIPT"}}
    ]
  };
  const result=scoreBasketConfidence(scenario,{now:new Date("2026-10-07T12:00:00Z")});
  assert.ok(result.score>=90);
  assert.equal(result.level,"high");
  assert.equal(result.locationReliable,true);
});

test("un panier incomplet et ancien reste faible",()=>{
  const scenario={
    distinctCount:4,pricedCount:1,locationReliable:false,locationKey:null,
    lines:[
      {missingPrice:false,bestPrice:{date:"2026-07-01",proofType:null}},
      {missingPrice:true},{missingPrice:true},{missingPrice:true}
    ]
  };
  const result=scoreBasketConfidence(scenario,{now:new Date("2026-10-07T12:00:00Z")});
  assert.ok(result.score<40);
});
