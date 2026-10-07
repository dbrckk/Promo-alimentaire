import test from "node:test";
import assert from "node:assert/strict";
import { offers } from "../src/data.js";
import { filterActiveOffers } from "../src/ingestion.js";

test("tous les taux panier statiques ont une échéance explicite",()=>{
  const payments=offers.filter((offer)=>offer.scope==="panier");
  assert.ok(payments.length>0);
  for(const offer of payments){
    assert.ok(offer.reviewAfter,offer.id+" manque une date de révision");
  }
});

test("les anciens taux statiques ne deviennent pas des économies garanties hors ligne",()=>{
  const active=filterActiveOffers(offers,new Date("2026-10-20T12:00:00Z"));
  assert.equal(active.some((offer)=>offer.scope==="panier"&&offer.autoStack),false);
});
