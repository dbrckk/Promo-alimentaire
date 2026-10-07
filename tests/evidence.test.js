import test from "node:test";
import assert from "node:assert/strict";
import { offerEvidenceStatus } from "../src/evidence.js";

test("EAN exact + magasin + carte requise donnent une preuve complète",()=>{
  const result=offerEvidenceStatus({
    eans:["3017624010701"],
    requiresStoreVerification:true,
    requiresLoyalty:"leclerc-card"
  },{
    storeVerified:true,
    loyaltyProfile:{leclerc:"card"}
  });
  assert.equal(result.level,"verified");
  assert.equal(result.canGuarantee,true);
  assert.deepEqual(result.blockers,[]);
});

test("EAN exact sans magasin confirmé reste exact produit seulement",()=>{
  const result=offerEvidenceStatus({
    eans:["3017624010701"],
    requiresStoreVerification:true
  },{storeVerified:false});
  assert.equal(result.level,"exact-product");
  assert.equal(result.canGuarantee,false);
  assert.ok(result.blockers.some((x)=>/magasin/.test(x)));
});

test("correspondance heuristique expose le blocage EAN",()=>{
  const result=offerEvidenceStatus({
    productMatch:{brands:["Marque"]}
  });
  assert.equal(result.level,"heuristic");
  assert.equal(result.productExact,false);
  assert.ok(result.blockers.some((x)=>/exacte/.test(x)));
});

test("carte fidélité inconnue bloque la garantie",()=>{
  const result=offerEvidenceStatus({
    eans:["3017624010701"],
    requiresLoyalty:"leclerc-card"
  },{loyaltyProfile:{leclerc:"unknown"}});
  assert.equal(result.canGuarantee,false);
  assert.ok(result.blockers.some((x)=>/non renseignée/.test(x)));
});


test("un EAN exact reste non garanti si le prix Drive doit être confirmé",()=>{
  const result=offerEvidenceStatus({
    eans:["3017624010701"],
    requiresChannelPriceVerification:true
  },{
    channelPriceVerified:false
  });
  assert.equal(result.productExact,true);
  assert.equal(result.channelPriceVerified,false);
  assert.equal(result.canGuarantee,false);
  assert.ok(result.blockers.some((x)=>/Prix du canal/.test(x)));
});

test("la validation du prix canal lève ce blocage",()=>{
  const result=offerEvidenceStatus({
    eans:["3017624010701"],
    requiresChannelPriceVerification:true
  },{
    channelPriceVerified:true
  });
  assert.equal(result.canGuarantee,true);
});
