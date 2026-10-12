import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {validateImportBatch} from "../src/ingestion.js";
import {selectDailyCatalogue} from "../src/daily-catalogue.js";

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

test("huit nouveaux produits alimentaires gardent le prix réel, le lot et le lien officiel",()=>{
  const expected=[
    ["26G133G-nissin-demae-ramen-68-second",0.99,2,34],
    ["26G133G-cote-table-cassoulet-40-second",1.15,2,20],
    ["26G133G-petit-navire-effiloches-thon-2plus1",2.50,3,33.33],
    ["26G133G-tramier-olives-noires-68-second",3.05,2,34],
    ["26G133G-menguys-melange-68-second",2.14,2,34],
    ["26G133G-lor-espresso-capri-68-second",3.39,2,34],
    ["26G133G-maille-vinaigre-balsamique-modene-30",4.79,1,30],
    ["26G133G-belle-chaurienne-plat-cuisine-34",11.49,1,34]
  ];
  const ids=new Set();
  for(const [id,price,quantity,rate] of expected){
    const offer=byExternalId(id);
    assert.ok(offer,id);
    assert.equal(offer.basePrice,price);
    assert.equal(offer.minPurchaseQty || 1,quantity);
    assert.equal(offer.savingPercent,rate);
    assert.equal(offer.stores[0],"leclerc");
    assert.deepEqual(offer.channels,["store"]);
    assert.equal(offer.verifiedAt,"2026-10-12");
    assert.equal(offer.expiresAt,"2026-10-17");
    assert.match(offer.sourceUrl,/^https:\/\/nos-catalogues-promos-v2\.e\.leclerc\/catalog\/26G133G\//);
    if(id==="26G133G-nissin-demae-ramen-68-second"){
      assert.equal(offer.sourceUrl,
        "https://nos-catalogues-promos-v2.e.leclerc/catalog/26G133G/1457",
        "Le prospectus Nissin doit pointer vers sa propre page produit publique");
    }
    assert.equal(offer.autoStack,false);
    assert.equal(offer.requiresStoreVerification,true);
    assert.equal(offer.eanResolutionBlocked,true);
    assert.equal(offer.multiReference,true);
    assert.equal(offer.eans,undefined,"Un EAN non vérifié ne doit pas être fabriqué");
    assert.equal(ids.has(id),false);
    ids.add(id);
  }
  const validated=validateImportBatch(offers);
  assert.equal(validated.ok,true,
    "Toutes les offres du catalogue doivent respecter les validations d'import");
  const daily=selectDailyCatalogue({offers:validated.normalized,
    store:"leclerc",channel:"store",now:new Date("2026-10-12T12:00:00Z"),
    sort:"budget",maxSpend:3,limit:30});
  const affordable=daily.retailer;
  assert.ok(affordable.some(x=>x.title.includes("Ramen Nissin")));
  assert.ok(affordable.some(x=>x.title.includes("Côté Table")));
  assert.equal(affordable.find(x=>x.title.includes("Ramen Nissin")).upfrontCost,1.98);
  assert.equal(affordable.find(x=>x.title.includes("Côté Table")).upfrontCost,2.30);
  assert.equal(affordable.some(x=>x.title.includes("Petit Navire")),false,
    "Un lot de trois à 2,50 € pièce coûte 7,50 € avant remboursement");
  assert.equal(affordable.some(x=>x.title.includes("Gullón")),false,
    "Une remise sur le deuxième ne rend pas le lot à 4,78 € abordable sous 3 €");
});
