import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeManualPrice,loadManualPrices,saveManualPrice,removeManualPrice,
  manualPriceObservations,mergeManualPriceObservations
} from "../src/manual-prices.js";

const now=new Date("2026-10-08T18:00:00.000Z");
const input={
  code:"3017624010701",store:"leclerc",storeName:"E.Leclerc Chalon Nord",
  postcode:"71100",date:"2026-10-08",price:"2,69"
};

test("le relevé manuel est chiffré et limité à un magasin renseigné",()=>{
  const entry=normalizeManualPrice(input,{now});
  assert.equal(entry.price,2.69);
  assert.equal(entry.store,"leclerc");
  assert.equal(entry.postcode,"71100");
  assert.equal(entry.source,"manual");
});

test("un relevé futur, périmé, négatif ou sans magasin est rejeté",()=>{
  for(const invalid of [
    {...input,date:"2026-10-11"},
    {...input,date:"2026-08-01"},
    {...input,date:"2026-02-30"},
    {...input,price:"-3"},
    {...input,price:"0"},
    {...input,postcode:"71"},
    {...input,storeName:""},
    {...input,store:"other"},
    {...input,code:"123"},
    {...input,price:"10001"}
  ]){
    assert.throws(()=>normalizeManualPrice(invalid,{now}));
  }
});

test("un relevé dupliqué est remplacé, pas cumulé",()=>{
  const once=saveManualPrice([],input,{now});
  const twice=saveManualPrice(once,{...input,price:"2,39"},{now});
  assert.equal(twice.length,1);
  assert.equal(twice[0].price,2.39);
  assert.equal(removeManualPrice(twice,twice[0].id,{now}).length,0);
});

test("le chargement local ignore les données corrompues et périmées",()=>{
  const entries=loadManualPrices([input,{...input,price:"garbage"},{...input,date:"2025-01-01"}],{now});
  assert.equal(entries.length,1);
});

test("une observation manuelle conserve une provenance distincte, pas une preuve communautaire",()=>{
  const [record]=manualPriceObservations([input],{now,store:"leclerc",code:input.code});
  assert.equal(record.source,"manual");
  assert.equal(record.manual,true);
  assert.equal(record.proofType,"manual");
  assert.equal(record.locationId,null);
  assert.equal(record.locationLat,null);
  assert.equal(record.price,2.69);
  assert.equal(manualPriceObservations([input],{now,store:"carrefour",code:input.code}).length,0);
});

test("fusionner des observations conserve les prix Open Prices existants",()=>{
  const data={["3017624010701"]:[{id:42,price:2.99,date:"2026-10-08"}]};
  const merged=mergeManualPriceObservations(data,[input],{now,store:"leclerc"});
  assert.equal(merged[input.code].length,2);
  assert.equal(merged[input.code][0].id,42);
  assert.equal(merged[input.code][1].manual,true);
  assert.equal(data[input.code].length,1);
});
