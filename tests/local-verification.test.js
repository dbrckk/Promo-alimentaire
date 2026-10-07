import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLocalStoreConfirmations,
  confirmationKey,
  createStoreConfirmation,
  isStoreConfirmationActive,
  pruneStoreConfirmations
} from "../src/local-verification.js";

const offer={
  id:"leclerc-promo",
  eans:["3017624010701"],
  requiresStoreVerification:true,
  expiresAt:"2026-10-10",
  autoStack:false,
  stackingConfidence:"low"
};

test("crée une confirmation liée à l'offre et au magasin",()=>{
  const c=createStoreConfirmation(offer,{
    store:"leclerc",
    locationKey:"id:42",
    locationName:"E.Leclerc Test",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  assert.equal(c.key,"leclerc-promo|leclerc|id:42");
  assert.equal(c.locationName,"E.Leclerc Test");
  assert.match(c.validUntil,/2026-10-10/);
});

test("refuse une confirmation sans EAN exact",()=>{
  assert.throws(()=>createStoreConfirmation(
    {...offer,eans:[]},
    {store:"leclerc",locationKey:"id:42"}
  ),/EAN exact/);
});

test("une confirmation active rend une promo exacte automatisable",()=>{
  const c=createStoreConfirmation(offer,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  const [resolved]=applyLocalStoreConfirmations([offer],[c],{
    store:"leclerc",locationKey:"id:42",
    now:new Date("2026-10-08T10:00:00Z")
  });
  assert.equal(resolved.storeVerified,true);
  assert.equal(resolved.autoStack,true);
  assert.equal(resolved.stackingConfidence,"high");
});

test("une fidélité non confirmée reste exclue malgré le magasin",()=>{
  const loyaltyOffer={
    ...offer,
    requiresLoyalty:"leclerc-card",
    loyaltyEligibility:"unknown"
  };
  const c=createStoreConfirmation(loyaltyOffer,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  const [resolved]=applyLocalStoreConfirmations([loyaltyOffer],[c],{
    store:"leclerc",locationKey:"id:42",
    now:new Date("2026-10-08T10:00:00Z")
  });
  assert.equal(resolved.storeVerified,true);
  assert.equal(resolved.autoStack,false);
});

test("une confirmation d'un autre magasin ne s'applique pas",()=>{
  const c=createStoreConfirmation(offer,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  assert.equal(isStoreConfirmationActive(c,offer,{
    store:"leclerc",locationKey:"id:99",
    now:new Date("2026-10-08T10:00:00Z")
  }),false);
});

test("pruneStoreConfirmations retire les confirmations expirées",()=>{
  const old={
    key:confirmationKey({offerId:"x",store:"leclerc",locationKey:"id:1"}),
    offerId:"x",store:"leclerc",locationKey:"id:1",
    confirmedAt:"2026-10-01T00:00:00Z",
    validUntil:"2026-10-02T00:00:00Z"
  };
  assert.deepEqual(pruneStoreConfirmations([old],new Date("2026-10-07T00:00:00Z")),[]);
});
