import test from "node:test";
import assert from "node:assert/strict";
import {canonicalGtin,sameGtin,isValidGtin} from "../src/gtin.js";
import {validateRetailerGtinEvidence} from "../src/retailer-ean-evidence.js";
import {normalizeImportedOffer} from "../src/ingestion.js";

const UPC="036000291452";
const EAN13="0036000291452";
const GTIN14="00036000291452";

test("GTIN valide : UPC-A, EAN-13 et GTIN-14 partagent une seule identité",()=>{
  for(const code of [UPC,EAN13,GTIN14]){
    assert.equal(isValidGtin(code),true);
    assert.equal(canonicalGtin(code),GTIN14);
  }
  assert.equal(sameGtin(UPC,EAN13),true);
  assert.equal(sameGtin(EAN13,GTIN14),true);
});

test("ne jamais assimiler codes invalides, codes vides ou produits distincts",()=>{
  assert.equal(canonicalGtin("036000291453"),null);
  assert.equal(canonicalGtin(null),null);
  assert.equal(sameGtin("", ""),false);
  assert.equal(sameGtin(UPC,"4006381333931"),false);
});

test("preuve officielle Carrefour avec code exact, y compris une représentation UPC",()=>{
  const result=validateRetailerGtinEvidence({
    providerId:"carrefour",
    eans:[EAN13],
    eanEvidenceUrl:"https://www.carrefour.fr/p/produit-036000291452"
  });
  assert.equal(result.ok,true);
});

test("preuve officielle E.Leclerc avec GTIN déclaré",()=>{
  const result=validateRetailerGtinEvidence({
    providerId:"leclerc",
    eans:["3564700602706"],
    eanEvidenceUrl:"https://www.e.leclerc/fp/mini-nems-3564700602706"
  });
  assert.equal(result.ok,true);
});

test("refuse usurpation domaine, mauvais article, page catalogue et deux produits sur une fiche",()=>{
  const good={
    providerId:"carrefour",
    eans:[EAN13],
    eanEvidenceUrl:"https://www.carrefour.fr/p/produit-0036000291452"
  };
  for(const bad of [
    {...good,eanEvidenceUrl:"https://www.carrefour.fr.evil.test/p/produit-0036000291452"},
    {...good,eanEvidenceUrl:"http://www.carrefour.fr/p/produit-0036000291452"},
    {...good,eanEvidenceUrl:"https://www.carrefour.fr/catalogue/0036000291452"},
    {...good,eanEvidenceUrl:"https://www.carrefour.fr/p/produit-4006381333931"},
    {...good,eans:[EAN13,"4006381333931"]}
  ]){
    assert.equal(validateRetailerGtinEvidence(bad).ok,false);
  }
});

test("ingestion fusionne deux écritures d'un même GTIN sans perdre sa preuve",()=>{
  const result=normalizeImportedOffer({
    providerId:"carrefour",
    externalId:"gtin-alias",
    title:"Remise sur article identifié",
    sourceUrl:"https://www.carrefour.fr/p/produit-036000291452",
    eanEvidenceUrl:"https://www.carrefour.fr/p/produit-036000291452",
    eans:[UPC,EAN13,GTIN14],
    stores:["carrefour"],
    verifiedAt:"2026-10-08",
    savingPercent:20
  });
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.deepEqual(result.value.eans,[UPC]);
});

test("ingestion refuse preuve Carrefour attribuée à un autre article",()=>{
  const result=normalizeImportedOffer({
    providerId:"carrefour",
    externalId:"bad-proof",
    title:"Remise trompeuse",
    sourceUrl:"https://www.carrefour.fr/p/produit-0036000291452",
    eanEvidenceUrl:"https://www.carrefour.fr/p/autre-4006381333931",
    eans:[EAN13],
    stores:["carrefour"],
    verifiedAt:"2026-10-08",
    savingPercent:30,
    autoStack:true
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.some((error)=>error.includes("GTIN de la fiche produit")));
});

test("les preuves des autres émetteurs conservent leurs règles existantes",()=>{
  const result=normalizeImportedOffer({
    providerId:"coupon-network",
    externalId:"test-off",
    title:"Remboursement",
    sourceUrl:"https://www.couponnetwork.fr/offer",
    eanEvidenceUrl:"https://www.couponnetwork.fr/conditions",
    eans:[EAN13],
    stores:["all"],
    verifiedAt:"2026-10-08",
    savingPercent:30
  });
  assert.equal(result.ok,true,JSON.stringify(result.errors));
});
