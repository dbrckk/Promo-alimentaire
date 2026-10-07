import test from "node:test";
import assert from "node:assert/strict";
import { isOfferActive, normalizeImportedOffer, validateImportBatch } from "../src/ingestion.js";

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
