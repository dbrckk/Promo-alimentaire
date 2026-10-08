import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {isValidGtin} from "../src/gtin.js";
import {normalizeImportedOffer} from "../src/ingestion.js";

const snapshot=JSON.parse(await readFile(
  new URL("../data/import/carrefour-promotions-auto.json",import.meta.url),"utf8"
));

test("snapshot Carrefour : EAN officiel et prix traçables",()=>{
  const ids=new Set();
  for(const offer of snapshot){
    assert.equal(ids.has(offer.externalId),false,offer.externalId);
    ids.add(offer.externalId);
    assert.equal(offer.providerId,"carrefour");
    assert.equal(offer.requiresChannelPriceVerification,true);
    assert.equal(offer.autoStack,false);
    assert.deepEqual(offer.channels,["drive","online"]);
    assert.equal(offer.eans.length,1);
    assert.ok(isValidGtin(offer.eans[0]),offer.externalId);
    const url=new URL(offer.sourceUrl);
    assert.equal(url.hostname,"www.carrefour.fr");
    assert.ok(url.pathname.endsWith("-"+offer.eans[0]),offer.externalId);
    assert.equal(offer.eanEvidenceUrl,offer.sourceUrl);
    assert.ok(offer.sourcePromoPrice>0);
    assert.ok(offer.sourceRegularPrice>offer.sourcePromoPrice);
    assert.ok(Math.abs((1-offer.sourcePromoPrice/offer.sourceRegularPrice)*100-offer.savingPercent)<1);
    assert.equal(normalizeImportedOffer(offer).ok,true,offer.externalId);
  }
});

test("les cinq nouvelles références Carrefour sont enregistrées",()=>{
  for(const code of [
    "3038359913273","3038359913297",
    "3041090767845","3041091647399","3123930715008"
  ]){
    assert.ok(snapshot.some(o=>o.eans?.includes(code)),code);
  }
});
