import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProductLoyaltyOffers,
  carrefourClubEligibility,
  loyaltyRequirementState,
  normalizeLoyaltyProfile,
  resolveOffersForLoyalty
} from "../src/loyalty.js";

test("normalizeLoyaltyProfile refuse les valeurs inconnues",()=>{
  assert.deepEqual(normalizeLoyaltyProfile({carrefour:"x",leclerc:"card"}),{
    carrefour:"unknown",leclerc:"card"
  });
});

test("une Carte PASS satisfait aussi l'exigence Club Carrefour",()=>{
  assert.equal(loyaltyRequirementState("carrefour-club",{carrefour:"pass"}),true);
  assert.equal(loyaltyRequirementState("carrefour-pass",{carrefour:"club"}),false);
});

test("une carte E.Leclerc connue rend l'offre éligible",()=>{
  const offers=resolveOffersForLoyalty([{
    id:"ticket",requiresLoyalty:"leclerc-card",
    autoStack:false,autoStackWhenEligible:true
  }],{leclerc:"card"});
  assert.equal(offers.length,1);
  assert.equal(offers[0].autoStack,true);
  assert.equal(offers[0].loyaltyEligibility,"eligible");
});

test("une carte explicitement absente retire l'offre fidélité",()=>{
  const offers=resolveOffersForLoyalty([{
    id:"ticket",requiresLoyalty:"leclerc-card"
  }],{leclerc:"none"});
  assert.equal(offers.length,0);
});

test("Carrefour Bio est reconnu comme éligible",()=>{
  const result=carrefourClubEligibility({
    brands:"Carrefour Bio",categories:[]
  });
  assert.equal(result.kind,"carrefour-bio");
});

test("un fruit frais catégorisé est reconnu",()=>{
  const result=carrefourClubEligibility({
    brands:"",categories:["en:fresh-fruits"]
  });
  assert.equal(result.kind,"fruit-veg");
});

test("Club Carrefour crée 10% et PASS 15%",()=>{
  const product={code:"12345678",brands:"Carrefour Bio",categories:[]};
  const club=buildProductLoyaltyOffers(product,{
    store:"carrefour",profile:{carrefour:"club"}
  });
  const pass=buildProductLoyaltyOffers(product,{
    store:"carrefour",profile:{carrefour:"pass"}
  });
  assert.equal(club[0].savingPercent,10);
  assert.equal(pass[0].savingPercent,15);
  assert.equal(club[0].autoStack,true);
  assert.equal(pass[0].autoStack,true);
});

test("profil Carrefour inconnu n'entre pas dans le total garanti",()=>{
  const product={code:"12345678",brands:"Carrefour Bio",categories:[]};
  const [offer]=buildProductLoyaltyOffers(product,{
    store:"carrefour",profile:{carrefour:"unknown"}
  });
  assert.equal(offer.savingPercent,10);
  assert.equal(offer.autoStack,false);
  assert.equal(offer.loyaltyEligibility,"unknown");
});
