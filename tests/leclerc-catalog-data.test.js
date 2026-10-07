import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const offers=JSON.parse(
  await readFile(new URL("../data/import/leclerc-catalog-2026-10-07.json",import.meta.url),"utf8")
);

function byExternalId(id){
  return offers.find((offer)=>offer.externalId===id);
}

test("les mini nems Tables du Monde gardent leur GTIN officiel",()=>{
  const offer=byExternalId("26G133G-mini-nems-tables-du-monde-20-ticket");
  assert.deepEqual(offer.eans,["3564700602706"]);
  assert.match(offer.eanEvidenceUrl,/e\.leclerc\/fp\/mini-nems/);
});

test("la tablette sans cacao caramel garde son GTIN officiel",()=>{
  const offer=byExternalId("26G122G-tablette-dor-sans-cacao-25-ticket");
  assert.deepEqual(offer.eans,["3564706822009"]);
  assert.match(offer.eanEvidenceUrl,/e\.leclerc\/fp\/tablette-sans-cacao/);
});

test("la promo Heudebert multi-références reste sans EAN unique",()=>{
  const offer=byExternalId("26G122G-heudebert-biscottes-2plus1");
  assert.ok(!Array.isArray(offer.eans) || offer.eans.length===0);
});

test("la promo Gullón gamme reste sans EAN unique",()=>{
  const offer=byExternalId("26G133G-gullon-biscuits-68-second");
  assert.ok(!Array.isArray(offer.eans) || offer.eans.length===0);
});


test("les gammes ambiguës sont explicitement bloquées pour la résolution EAN automatique",()=>{
  const ids=[
    "26G122G-heudebert-biscottes-2plus1",
    "26G133G-gullon-biscuits-68-second",
    "26G122G-nescafe-espresso-concentrate-34"
  ];
  for(const id of ids){
    const offer=byExternalId(id);
    assert.equal(offer.multiReference,true);
    assert.equal(offer.eanResolutionBlocked,true);
    assert.ok(offer.eanResolutionReason.length>20);
  }
});
