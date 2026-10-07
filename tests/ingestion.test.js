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
