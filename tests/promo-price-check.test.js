import test from "node:test";
import assert from "node:assert/strict";
import {
  assessRetailerPromoPrice,
  assessCouponNetworkCompatibility
} from "../src/promo-price-check.js";

const offer={
  mechanism:"retailer_promo",
  savingPercent:30,
  sourceRegularPrice:1.59,
  sourcePromoPrice:1.11
};

test("le prix catalogue normal reste éligible",()=>{
  assert.deepEqual(assessRetailerPromoPrice({price:1.59,isDiscounted:false},offer),{
    eligible:true,reason:null
  });
});

test("le prix catalogue promo n'est jamais remisé une seconde fois",()=>{
  const result=assessRetailerPromoPrice({price:1.11,isDiscounted:false},offer);
  assert.equal(result.eligible,false);
  assert.equal(result.reason,"source-promo-may-already-be-included");
});

test("un prix intermédiaire n'autorise pas une promotion supplémentaire",()=>{
  assert.equal(assessRetailerPromoPrice({price:1.35,isDiscounted:false},offer).eligible,false);
});

test("un prix supérieur au prix normal annoncé bloque la remise incertaine",()=>{
  assert.equal(assessRetailerPromoPrice({price:1.99,isDiscounted:false},offer).eligible,false);
});

test("une observation explicitement déjà remisée reste bloquée",()=>{
  assert.equal(assessRetailerPromoPrice({price:1.59,isDiscounted:true},offer).eligible,false);
});

test("une offre sans prix source conserve la compatibilité existante",()=>{
  assert.equal(assessRetailerPromoPrice({price:10},{mechanism:"retailer_promo"}).eligible,true);
});

test("les remises fidélité ne sont pas filtrées comme promotions immédiates",()=>{
  assert.equal(assessRetailerPromoPrice({price:1.11},{
    ...offer,mechanism:"retailer_loyalty"
  }).eligible,true);
});

test("les champs absents ne sont pas confondus avec un prix zéro",()=>{
  assert.equal(assessRetailerPromoPrice({price:5},{
    mechanism:"retailer_promo",sourcePromoPrice:null,sourceRegularPrice:null
  }).eligible,true);
});

test("Coupon Network n'est pas additionné à un prix déjà remisé",()=>{
  const cn={providerId:"coupon-network",mechanism:"manufacturer_refund"};
  const discounted={price:7,isDiscounted:true,priceWithoutDiscount:10};
  assert.equal(assessCouponNetworkCompatibility(discounted,cn).eligible,false);
  assert.equal(assessCouponNetworkCompatibility({
    price:7,isDiscounted:false,priceWithoutDiscount:10
  },cn).eligible,false);
  assert.equal(assessCouponNetworkCompatibility({
    price:10,isDiscounted:false,priceWithoutDiscount:null
  },cn).eligible,true);
});

test("la règle Coupon Network ne bloque pas les crédits fidélité",()=>{
  const discounted={price:7,isDiscounted:true,priceWithoutDiscount:10};
  assert.equal(assessCouponNetworkCompatibility(discounted,{
    providerId:"carrefour",mechanism:"retailer_loyalty"
  }).eligible,true);
});
