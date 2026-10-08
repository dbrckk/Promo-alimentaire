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

test("une confirmation ancienne sans empreinte n'est pas acceptée",()=>{
  const confirmation=createStoreConfirmation(offer,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  delete confirmation.offerFingerprint;
  assert.equal(isStoreConfirmationActive(confirmation,offer,{
    store:"leclerc",locationKey:"id:42",
    now:new Date("2026-10-08T10:00:00Z")
  }),false);
});

test("changer EAN ou taux invalide la confirmation précédente",()=>{
  const confirmation=createStoreConfirmation(offer,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  for(const changed of [
    {...offer,eans:["12345678"]},
    {...offer,savingPercent:25},
    {...offer,promoFormula:{type:"buy_x_get_y_free",buy:2,free:1}}
  ]){
    assert.equal(isStoreConfirmationActive(confirmation,changed,{
      store:"leclerc",locationKey:"id:42",
      now:new Date("2026-10-08T10:00:00Z")
    }),false);
  }
});


test("changer canal, exclusions ou cumul invalide une confirmation",()=>{
  const base={...offer,channels:["store"],conditions:"Sans cumul",stacking:"Exclusif"};
  const confirmation=createStoreConfirmation(base,{
    store:"leclerc",locationKey:"id:42",confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  for(const changed of [
    {...base,channels:["online"]},
    {...base,conditions:"Cumul autorisé"},
    {...base,stacking:"Cumul possible"},
    {...base,reviewAfter:"2026-10-09"},
    {...base,eanEvidenceUrl:"https://example.com/new-source"}
  ]){
    assert.equal(isStoreConfirmationActive(confirmation,changed,{
      store:"leclerc",locationKey:"id:42",now:new Date("2026-10-08T10:00:00Z")
    }),false);
  }
});

test("la vérification magasin ne valide pas un prix Drive non vérifié",()=>{
  const restricted={...offer,requiresChannelPriceVerification:true};
  const confirmation=createStoreConfirmation(restricted,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  const [result]=applyLocalStoreConfirmations([restricted],[confirmation],{
    store:"leclerc",locationKey:"id:42",
    now:new Date("2026-10-08T10:00:00Z")
  });
  assert.equal(result.storeVerified,true);
  assert.equal(result.autoStack,false);
});

test("la revue expirée interdit une nouvelle confirmation",()=>{
  assert.throws(()=>createStoreConfirmation({
    ...offer,reviewAfter:"2026-10-06"
  },{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  }),/expirée|réviser/);
});

test("une confirmation expire aussi au prochain contrôle de source",()=>{
  const expiring={...offer,reviewAfter:"2026-10-08"};
  const c=createStoreConfirmation(expiring,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  assert.match(c.validUntil,/2026-10-08/);
  assert.equal(isStoreConfirmationActive(c,expiring,{
    store:"leclerc",locationKey:"id:42",
    now:new Date("2026-10-09T00:00:00Z")
  }),false);
});


test("la confirmation en magasin n'est pas transférable au Drive ou à la livraison",()=>{
  const mixed={...offer,channels:["store","drive","online"]};
  const c=createStoreConfirmation(mixed,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  for(const channel of ["drive","online"]){
    const [result]=applyLocalStoreConfirmations([mixed],[c],{
      store:"leclerc",locationKey:"id:42",channel,
      now:new Date("2026-10-08T10:00:00Z")
    });
    assert.equal(result.autoStack,false);
    assert.equal(result.storeVerified,undefined);
  }
  const [inStore]=applyLocalStoreConfirmations([mixed],[c],{
    store:"leclerc",locationKey:"id:42",channel:"store",
    now:new Date("2026-10-08T10:00:00Z")
  });
  assert.equal(inStore.storeVerified,true);
});
