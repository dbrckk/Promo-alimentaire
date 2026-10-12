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
  assert.equal(c.validUntil,"2026-10-10T21:59:59.999Z",
    "La date limite du samedi doit être 23:59:59.999 heure de Paris");
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
  assert.throws(()=>createStoreConfirmation({
    ...offer,verifiedAt:"2026-10-09"
  },{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-08T12:00:00Z")
  }),/non démarrée|impossible/,
  "une source vérifiée dans le futur ne peut pas être validée aujourd'hui");
  const startsParis={...offer,startsAt:"2026-10-08"};
  const accepted=createStoreConfirmation(startsParis,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T22:15:00Z")
  });
  assert.equal(accepted.confirmedAt,"2026-10-07T22:15:00.000Z",
    "00h15 en France le 8/10 est déjà dans la période de l'offre");
  assert.throws(()=>createStoreConfirmation(startsParis,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T21:59:59Z")
  }),/non démarrée|impossible/);
});

test("une confirmation expire aussi au prochain contrôle de source",()=>{
  const expiring={...offer,reviewAfter:"2026-10-08"};
  const c=createStoreConfirmation(expiring,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  assert.equal(c.validUntil,"2026-10-08T21:59:59.999Z");
  assert.equal(isStoreConfirmationActive(c,expiring,{
    store:"leclerc",locationKey:"id:42",
    now:new Date("2026-10-08T21:59:59.999Z")
  }),true);
  assert.equal(isStoreConfirmationActive(c,expiring,{
    store:"leclerc",locationKey:"id:42",
    now:new Date("2026-10-08T22:00:00Z")
  }),false,
  "une preuve magasin ne peut pas prolonger l'offre après minuit Paris");

  for(const [date,confirmedAt,lastUtc] of [
    ["2026-03-28","2026-03-28T12:00:00Z","2026-03-28T22:59:59.999Z"],
    ["2026-03-29","2026-03-29T12:00:00Z","2026-03-29T21:59:59.999Z"],
    ["2026-10-24","2026-10-24T12:00:00Z","2026-10-24T21:59:59.999Z"],
    ["2026-10-25","2026-10-25T12:00:00Z","2026-10-25T22:59:59.999Z"]
  ]){
    const dated={...offer,expiresAt:date};
    const result=createStoreConfirmation(dated,{
      store:"leclerc",locationKey:"id:42",confirmedAt:new Date(confirmedAt)
    });
    assert.equal(result.validUntil,lastUtc,date+" : minuit civil français malgré l'heure d'été/hiver");
  }
  const exact={...offer,expiresAt:"2026-10-10T22:20:00Z"};
  const confirmedExact=createStoreConfirmation(exact,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-10T22:10:00Z")
  });
  assert.equal(confirmedExact.validUntil,"2026-10-10T22:20:00.000Z",
    "les échéances horodatées conservent leur instant exact");
  const shopmium={...offer,providerId:"shopmium",
    verifiedAt:"2026-10-07",expiresAt:"2026-11-30"};
  const shopmiumProof=createStoreConfirmation(shopmium,{
    store:"leclerc",locationKey:"id:42",
    confirmedAt:new Date("2026-10-10T10:00:00Z")
  });
  assert.equal(shopmiumProof.validUntil,"2026-10-12T21:59:59.999Z",
    "la limite de contrôle Shopmium doit s'appliquer même sans reviewAfter");
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
