import test from "node:test";
import assert from "node:assert/strict";
import { assertValidGtin, isValidGtin, normalizeGtin } from "../src/gtin.js";

test("normalizeGtin conserve les chiffres significatifs",()=>{
  assert.equal(normalizeGtin("3017 6240 10701"),"3017624010701");
});

test("isValidGtin valide un EAN-13 connu",()=>{
  assert.equal(isValidGtin("4006381333931"),true);
  assert.equal(isValidGtin("4006381333932"),false);
});

test("assertValidGtin refuse un mauvais checksum",()=>{
  assert.throws(()=>assertValidGtin("3017624010702"),/Checksum GTIN invalide/);
});
