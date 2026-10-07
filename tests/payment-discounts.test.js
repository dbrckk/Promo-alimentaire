import test from "node:test";
import assert from "node:assert/strict";
import { extractNearbyAmount, extractNearbyPercent, parsePaymentDiscountPages } from "../src/adapters/payment-discounts.js";

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
    ebuyclubConnected:"E.Leclerc 0,05% remboursés Carrefour 0,05% remboursés",
    ebuyclubOnline:"E.Leclerc Jusqu'à 2,5% remboursés Carrefour Jusqu'à 3€ remboursés"
  },{verifiedAt:"2026-10-07"});
  assert.equal(offers.length,8);
  assert.equal(offers.find((x)=>x.providerId==="widilo").savingPercent,4);
  assert.equal(offers.filter((x)=>x.mechanism==="card_cashback").length,2);
  assert.ok(offers.every((x)=>x.reviewAfter==="2026-10-14"));
});


test("extractNearbyAmount lit un plafond en euros",()=>{
  assert.equal(extractNearbyAmount("Carrefour Jusqu'à 3€ remboursés","Carrefour"),3);
});

test("les cashbacks web sont limités au canal online",()=>{
  const offers=parsePaymentDiscountPages({
    fidme:"Carrefour 4%",
    widilo:"Carte cadeau Carrefour 4%",
    ebuyclubGiftCard:"CARTE CADEAU CARREFOUR 3,6%",
    poulpeo:"Carrefour 3,6%",
    ebuyclubConnected:"E.Leclerc 0,05% Carrefour 0,05%",
    ebuyclubOnline:"E.Leclerc Jusqu'à 2,5% remboursés Carrefour Jusqu'à 3€ remboursés"
  },{verifiedAt:"2026-10-07"});
  const web=offers.filter((x)=>x.mechanism==="affiliate_cashback");
  assert.equal(web.length,2);
  assert.ok(web.every((x)=>x.channels.includes("online")));
});


test("extractNearbyPercent choisit le taux le plus proche et non le maximum",()=>{
  const html="Marchand voisin 44% de réduction … Carte cadeau Carrefour 4% de cashback";
  assert.equal(extractNearbyPercent(html,"Carte cadeau Carrefour"),4);
});

test("extractNearbyPercent ne vole pas le taux d'un marchand adjacent",()=>{
  const html="CLEOR 6% remboursés · Carrefour 0,05% remboursés · E.Leclerc 0,05% remboursés";
  assert.equal(extractNearbyPercent(html,"Carrefour"),0.05);
  assert.equal(extractNearbyPercent(html,"E.Leclerc"),0.05);
});

test("extractNearbyPercent isole E.Leclerc sur une page multi-marchands",()=>{
  const html="YSL 6,5% remboursés · E.Leclerc Jusqu'à 2,5% remboursés · Carrefour Jusqu'à 3€ remboursés";
  assert.equal(extractNearbyPercent(html,"E.Leclerc"),2.5);
});

test("extractNearbyAmount choisit le montant le plus proche et non le maximum",()=>{
  const html="Autre offre 300€ · Carrefour Jusqu'à 3€ remboursés";
  assert.equal(extractNearbyAmount(html,"Carrefour"),3);
});
