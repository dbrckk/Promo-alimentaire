import test from "node:test";
import assert from "node:assert/strict";
import { filterActiveOffers, isOfferActive, normalizeImportedOffer, trustedImportedGiftCard, validateImportBatch } from "../src/ingestion.js";

const valid={
  providerId:"provider",
  externalId:"offer-1",
  title:"Offre test",
  stores:["carrefour"],
  savingPercent:40,
  verifiedAt:"2026-10-07",
  startsAt:"2026-10-01",
  expiresAt:"2026-10-31",
  sourceUrl:"https://example.com/offer",
  eans:["4006381333931"],
  eanEvidenceUrl:"https://example.com/ean-proof"
};

test("normalizeImportedOffer accepte un EAN traçable",()=>{
  const result=normalizeImportedOffer(valid);
  assert.equal(result.ok,true);
  assert.equal(result.value.eans[0],"4006381333931");
  assert.equal(result.value.ingestion.exactEanTraceable,true);
});

test("un EAN exact sans URL de preuve est refusé",()=>{
  const result=normalizeImportedOffer({...valid,eanEvidenceUrl:null});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((error)=>error.includes("eanEvidenceUrl")));
});

test("validateImportBatch refuse les ids dupliqués",()=>{
  const result=validateImportBatch([valid,valid]);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((item)=>item.errors[0].includes("dupliqué")));
});

test("isOfferActive respecte les dates",()=>{
  assert.equal(isOfferActive(valid,new Date("2026-10-07T12:00:00Z")),true);
  assert.equal(isOfferActive(valid,new Date("2026-11-02T12:00:00Z")),false);
});


test("normalizeImportedOffer conserve productMatch et quantityTiers",()=>{
  const result=normalizeImportedOffer({
    ...valid,
    savingPercent:null,
    productMatch:{brands:["Barilla"],any:["Al Bronzo"]},
    quantityTiers:[
      {minQty:1,maxQty:2,savingPercent:20},
      {minQty:3,maxQty:3,savingPercent:30}
    ],
    eans:[],
    eanEvidenceUrl:null
  });
  assert.equal(result.ok,true);
  assert.equal(result.value.productMatch.brands[0],"Barilla");
  assert.equal(result.value.quantityTiers[1].savingPercent,30);
});

test("isOfferActive respecte reviewAfter",()=>{
  const offer={...valid,expiresAt:null,reviewAfter:"2026-10-20"};
  assert.equal(isOfferActive(offer,new Date("2026-10-19T12:00:00Z")),true);
  assert.equal(isOfferActive(offer,new Date("2026-10-22T12:00:00Z")),false);
});


test("normalizeImportedOffer accepte un bundle multi-produits",()=>{
  const result=normalizeImportedOffer({
    providerId:"envie-plus",externalId:"dash-lenor",title:"Dash + Lenor",
    stores:["all"],scope:"bundle",savingPercent:100,savingCapAmount:10,
    verifiedAt:"2026-10-07",sourceUrl:"https://example.com/bundle",
    bundleRequirements:[
      {id:"dash",minQty:1,productMatch:{brands:["Dash"]}},
      {id:"lenor",minQty:1,productMatch:{brands:["Lenor"]}}
    ],
    bundleTargetRequirementId:"lenor"
  });
  assert.equal(result.ok,true);
  assert.equal(result.value.bundleRequirements.length,2);
  assert.equal(result.value.savingCapAmount,10);
});

test("un bundle sans cible valide est refusé",()=>{
  const result=normalizeImportedOffer({
    providerId:"x",externalId:"b",title:"Bundle",stores:["all"],scope:"bundle",
    savingPercent:100,verifiedAt:"2026-10-07",sourceUrl:"https://example.com/x",
    bundleRequirements:[
      {id:"a",productMatch:{brands:["A"]}},
      {id:"b",productMatch:{brands:["B"]}}
    ],
    bundleTargetRequirementId:"missing"
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((error)=>error.includes("bundleTargetRequirementId")));
});


test("normalizeImportedOffer conserve minPurchaseQty et savingAmountMode",()=>{
  const result=normalizeImportedOffer({
    providerId:"coupon-network",externalId:"two-pack",title:"Deux produits",
    stores:["all"],savingAmount:1.2,minPurchaseQty:2,
    verifiedAt:"2026-10-07",sourceUrl:"https://example.com/offer"
  });
  assert.equal(result.ok,true);
  assert.equal(result.value.minPurchaseQty,2);
  assert.equal(result.value.savingAmountMode,"per-offer");
});


test("normalizeImportedOffer conserve les règles promo enseigne",()=>{
  const result=normalizeImportedOffer({
    providerId:"leclerc",
    externalId:"promo-2plus1",
    title:"2+1 offert",
    sourceUrl:"https://www.e.leclerc/",
    verifiedAt:"2026-10-07",
    expiresAt:"2026-10-17",
    stores:["leclerc"],
    channels:["store"],
    scope:"produit",
    savingPercent:33.33,
    basePrice:1.67,
    mechanism:"retailer_promo",
    requiresStoreVerification:true,
    promoFormula:{type:"buy_x_get_y_free",buy:2,free:1}
  });
  assert.equal(result.ok,true);
  assert.equal(result.value.basePrice,1.67);
  assert.equal(result.value.promoFormula.type,"buy_x_get_y_free");
  assert.equal(result.value.autoStack,false);
  assert.equal(result.value.requiresStoreVerification,true);
});

test("normalizeImportedOffer conserve l'exigence de carte fidélité",()=>{
  const result=normalizeImportedOffer({
    providerId:"leclerc",
    externalId:"ticket",
    title:"20% Ticket E.Leclerc",
    sourceUrl:"https://www.e.leclerc/",
    verifiedAt:"2026-10-07",
    stores:["leclerc"],
    scope:"produit",
    savingPercent:20,
    requiresLoyalty:"leclerc-card",
    autoStackWhenEligible:true
  });
  assert.equal(result.ok,true);
  assert.equal(result.value.requiresLoyalty,"leclerc-card");
  assert.equal(result.value.autoStackWhenEligible,true);
});


test("normalizeImportedOffer conserve le blocage de résolution GTIN",()=>{
  const result=normalizeImportedOffer({
    providerId:"leclerc",
    externalId:"range",
    title:"Gamme multi-références",
    sourceUrl:"https://www.e.leclerc/",
    verifiedAt:"2026-10-07",
    stores:["leclerc"],
    scope:"produit",
    savingPercent:20,
    multiReference:true,
    eanResolutionBlocked:true,
    eanResolutionReason:"Plusieurs variantes possibles."
  });
  assert.equal(result.ok,true);
  assert.equal(result.value.multiReference,true);
  assert.equal(result.value.eanResolutionBlocked,true);
  assert.equal(result.value.eanResolutionReason,"Plusieurs variantes possibles.");
});


test("normalizeImportedOffer conserve le besoin de vérifier le prix du canal",()=>{
  const result=normalizeImportedOffer({
    providerId:"carrefour",
    externalId:"drive-promo",
    title:"Promo Drive",
    sourceUrl:"https://www.carrefour.fr/p/test-4006381333931",
    verifiedAt:"2026-10-07",
    stores:["carrefour"],
    channels:["drive","online"],
    scope:"produit",
    savingPercent:30,
    eans:["4006381333931"],
    eanEvidenceUrl:"https://www.carrefour.fr/p/test-4006381333931",
    requiresChannelPriceVerification:true,
    autoStack:true
  });
  assert.equal(result.ok,true);
  assert.equal(result.value.requiresChannelPriceVerification,true);
  assert.equal(result.value.autoStack,false);
});


test("normalizeImportedOffer conserve les prix source d'une promo Carrefour",()=>{
  const result=normalizeImportedOffer({
    providerId:"carrefour",
    externalId:"exact-promo",
    title:"Promo exacte",
    sourceUrl:"https://www.carrefour.fr/p/test-4006381333931",
    verifiedAt:"2026-10-07",
    reviewAfter:"2026-10-09",
    stores:["carrefour"],
    channels:["drive","online"],
    scope:"produit",
    savingPercent:30,
    basePrice:1.59,
    sourceRegularPrice:1.59,
    sourcePromoPrice:1.11,
    eans:["4006381333931"],
    eanEvidenceUrl:"https://www.carrefour.fr/p/test-4006381333931",
    requiresChannelPriceVerification:true
  });
  assert.equal(result.ok,true);
  assert.equal(result.value.sourceRegularPrice,1.59);
  assert.equal(result.value.sourcePromoPrice,1.11);
});


test("validateImportBatch refuse une structure non-tableau",()=>{
  assert.equal(validateImportBatch({offers:[]}).ok,false);
  assert.equal(validateImportBatch(null).ok,false);
});

test("un produit importé sans EAN prouvé ne peut pas se déclarer cumulable automatiquement",()=>{
  const base={
    providerId:"shopmium",externalId:"example",title:"Exemple",
    stores:["carrefour"],verifiedAt:"2026-10-07",
    sourceUrl:"https://example.com/promo",
    savingPercent:20,scope:"produit",autoStack:true
  };
  const uncertain=normalizeImportedOffer(base);
  assert.equal(uncertain.ok,true);
  assert.equal(uncertain.value.autoStack,false);
  const exact=normalizeImportedOffer({
    ...base,eans:["3017624010701"],eanEvidenceUrl:"https://example.com/3017624010701"
  });
  assert.equal(exact.ok,true);
  assert.equal(exact.value.autoStack,true);
  const card=normalizeImportedOffer({...base,scope:"panier"});
  assert.equal(card.value.autoStack,false);
});


test("filterActiveOffers retire une offre dès sa revue dépassée sans recharger la PWA",()=>{
  const input=[
    {id:"live",reviewAfter:"2026-10-10"},
    {id:"stale",reviewAfter:"2026-10-07"},
    {id:"future",startsAt:"2026-10-09"},
    {id:"permanent"}
  ];
  const result=filterActiveOffers(input,new Date("2026-10-08T12:00:00"));
  assert.deepEqual(result.map((offer)=>offer.id),["live","permanent"]);
});


test("seule une carte cadeau traçable et récente peut être automatiquement appliquée",()=>{
  const raw={
    providerId:"widilo",
    externalId:"carrefour-current",
    title:"Carte cadeau Carrefour 4%",
    stores:["carrefour"],
    channels:["store"],
    scope:"panier",
    savingPercent:4,
    sourceUrl:"https://www.widilo.fr/bon-d-achat/carrefour",
    verifiedAt:"2026-10-07",
    reviewAfter:"2026-10-14",
    mechanism:"gift_card",
    stackGroup:"payment-discount",
    autoStack:true
  };
  const valid=normalizeImportedOffer(raw);
  assert.equal(valid.ok,true);
  assert.equal(valid.value.autoStack,true);

  const suspicious=[
    {...raw,sourceUrl:"https://widilo.fr.evil.example/offre"},
    {...raw,savingPercent:44},
    {...raw,reviewAfter:"2026-11-28"},
    {...raw,mechanism:"affiliate_cashback"},
    {...raw,channels:["online"]},
    {...raw,stackGroup:"other-group"},
    {...raw,providerId:"fake-provider"}
  ];
  for(const candidate of suspicious){
    const result=normalizeImportedOffer(candidate);
    assert.equal(result.ok,true);
    assert.equal(result.value.autoStack,false);
  }
});

test("les cadeaux de sources non approuvées restent des candidats",()=>{
  assert.equal(trustedImportedGiftCard({
    value:{providerId:"unverified",scope:"panier",mechanism:"gift_card",stackGroup:"payment-discount"},
    stores:["carrefour"],sourceUrl:"https://example.com",
    verifiedAt:"2026-10-07",reviewAfter:"2026-10-14",savingPercent:5
  }),false);
});
