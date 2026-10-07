import test from "node:test";
import assert from "node:assert/strict";
import { buildSavingsActionPlan } from "../src/action-plan.js";

test("le plan place Joko avant le paiement",()=>{
  const result=buildSavingsActionPlan({
    store:"carrefour",
    providers:[{id:"joko",stores:["carrefour"],url:"https://www.joko.com/"}],
    selectedPayment:{provider:"Widilo",savingPercent:4,sourceUrl:"https://example.com"}
  });
  assert.equal(result.steps[0].phase,"avant");
  assert.match(result.steps[0].title,/Joko/);
  assert.equal(result.steps[1].phase,"paiement");
});

test("le plan ajoute les ODR après achat",()=>{
  const result=buildSavingsActionPlan({
    store:"leclerc",
    providers:[],
    productCandidates:[{offer:{provider:"Shopmium",sourceUrl:"https://example.com"}}]
  });
  assert.ok(result.steps.some((step)=>step.phase==="après" && /ODR/.test(step.title)));
  assert.ok(result.steps.some((step)=>step.phase==="achat" && /preuve/.test(step.title.toLowerCase())));
});

test("les cashbacks carte incertains restent des vérifications",()=>{
  const result=buildSavingsActionPlan({
    store:"carrefour",
    providers:[],
    uncertainBasketOffers:[
      {mechanism:"card_cashback",provider:"eBuyClub",title:"Cashback connecté"}
    ]
  });
  const step=result.steps.find((item)=>/cashbacks carte/.test(item.title));
  assert.equal(step.kind,"check");
});
