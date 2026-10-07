import test from "node:test";
import assert from "node:assert/strict";
import { extractNearbyPercent, parsePaymentDiscountPages } from "../src/adapters/payment-discounts.js";

test("extractNearbyPercent lit le taux proche d'une enseigne",()=>{
  const html="<div>Carrefour - 4% de réduction</div><div>Auchan - 3%</div>";
  assert.equal(extractNearbyPercent(html,"Carrefour"),4);
});

test("parsePaymentDiscountPages normalise les quatre bons et deux cashbacks connectés",()=>{
  const offers=parsePaymentDiscountPages({
    fidme:"Carrefour 4% de réduction",
    widilo:"Carte cadeau Carrefour 4% de cashback",
    ebuyclubGiftCard:"CARTE CADEAU CARREFOUR 3,6% remboursés immédiatement",
    poulpeo:"Carrefour 3,6% de cashback immédiat",
    ebuyclubConnected:"E.Leclerc 0,05% remboursés Carrefour 0,05% remboursés"
  },{verifiedAt:"2026-10-07"});
  assert.equal(offers.length,6);
  assert.equal(offers.find((x)=>x.providerId==="widilo").savingPercent,4);
  assert.equal(offers.filter((x)=>x.mechanism==="card_cashback").length,2);
  assert.ok(offers.every((x)=>x.reviewAfter==="2026-10-14"));
});
