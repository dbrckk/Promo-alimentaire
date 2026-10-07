import test from "node:test";
import assert from "node:assert/strict";
import { offerEvidenceStatus } from "../src/evidence.js";

test("EAN exact + magasin + carte requise donnent une preuve complète",()=>{
  const result=offerEvidenceStatus({
    eans:["3017624010701"],
    requiresStoreVerification:true,
    requiresLoyalty:"leclerc-card"
  },{
    productCode:"3017624010701",
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
  },{productCode:"3017624010701",storeVerified:false});
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
  },{productCode:"3017624010701",loyaltyProfile:{leclerc:"unknown"}});
  assert.equal(result.canGuarantee,false);
  assert.ok(result.blockers.some((x)=>/non renseignée/.test(x)));
});


test("un EAN exact reste non garanti si le prix Drive doit être confirmé",()=>{
  const result=offerEvidenceStatus({
    eans:["3017624010701"],
    requiresChannelPriceVerification:true
  },{
    productCode:"3017624010701",
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
    productCode:"3017624010701",
    channelPriceVerified:true
  });
  assert.equal(result.canGuarantee,true);
});

test("un EAN simplement présent dans l'offre n'est pas une preuve de correspondance",()=>{
  const offer={eans:["3017624010701"]};
  assert.equal(offerEvidenceStatus(offer).canGuarantee,false);
  assert.equal(offerEvidenceStatus(offer,{productCode:"4006381333931"}).productExact,false);
  assert.equal(offerEvidenceStatus(offer,{productCode:"3017624010701"}).productExact,true);
});

test("un match heuristique ne devient pas exact si l'offre contient un EAN",()=>{
  const offer={eans:["3017624010701"],productMatch:{brands:["Test"]}};
  const status=offerEvidenceStatus(offer,{match:{exact:false,matched:true}});
  assert.equal(status.canGuarantee,false);
  assert.notEqual(status.level,"verified");
});
