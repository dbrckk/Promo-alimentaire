import test from "node:test";
import assert from "node:assert/strict";
import {
  effectiveRetailerPromoPercent,
  estimateRetailerPromoSaving,
  minimumQuantityForRetailerPromo
} from "../src/retailer-promo.js";

test("−68% sur le 2e vaut 34% effectifs sur une paire",()=>{
  const offer={
    basePrice:2.39,
    promoFormula:{type:"nth_percent",nth:2,cycle:2,percent:68}
  };
  assert.equal(estimateRetailerPromoSaving(2.39,2,offer),1.63);
  assert.equal(effectiveRetailerPromoPercent(offer),34.1);
  assert.equal(minimumQuantityForRetailerPromo(offer),2);
});

test("−68% sur le 2e ne s'applique pas à une seule unité",()=>{
  const offer={promoFormula:{type:"nth_percent",nth:2,cycle:2,percent:68}};
  assert.equal(estimateRetailerPromoSaving(2.39,1,offer),null);
});

test("2+1 offert calcule une unité gratuite par groupe de trois",()=>{
  const offer={
    basePrice:1.67,
    promoFormula:{type:"buy_x_get_y_free",buy:2,free:1}
  };
  assert.equal(estimateRetailerPromoSaving(1.67,3,offer),1.67);
  assert.equal(estimateRetailerPromoSaving(1.67,6,offer),3.34);
  assert.equal(effectiveRetailerPromoPercent(offer),33.33);
});

test("bundle_price calcule la différence au prix normal",()=>{
  const offer={
    promoFormula:{type:"bundle_price",groupQty:2,bundlePrice:3}
  };
  assert.equal(estimateRetailerPromoSaving(2,2,offer),1);
});
