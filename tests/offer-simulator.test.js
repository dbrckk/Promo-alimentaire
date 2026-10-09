import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSimulatedUnitPrice,parseSimulatedQuantity,simulateProductOffer
} from "../src/offer-simulator.js";
import {rankOffers} from "../src/domain.js";
import {effectiveOfferPercent,estimateOfferSaving} from "../src/matching.js";

const refund={id:"basic",scope:"produit",mechanism:"manufacturer_refund",
  savingAmount:1.5,minPurchaseQty:1,savingAmountMode:"per-offer"};

test("simulation accepte virgule française, prix positif et quantité entière",()=>{
  assert.equal(parseSimulatedUnitPrice("2,49"),2.49);
  assert.equal(parseSimulatedUnitPrice(" 1 234,50 "),1234.5);
  assert.equal(parseSimulatedUnitPrice(3.2),3.2);
  assert.equal(parseSimulatedQuantity("3"),3);
  assert.equal(parseSimulatedQuantity(100),100);
  for(const p of ["","0","-1","2,499","3abc","Infinity","10000,01",null]){
    assert.equal(parseSimulatedUnitPrice(p),null,String(p));
  }
  for(const q of ["","0","1,5","-2","101","20x",null]){
    assert.equal(parseSimulatedQuantity(q),null,String(q));
  }
});

test("remboursement fixe payé après achat ne se multiplie pas par le nombre d'unités",()=>{
  const one=simulateProductOffer(refund,{unitPrice:"3,00",quantity:"1"});
  assert.equal(one.status,"estimated");
  assert.equal(one.upfront,3);
  assert.equal(one.saving,1.5);
  assert.equal(one.netCost,1.5);
  assert.equal(one.realizedPercent,50);
  assert.equal(one.isRefund,true);
  const two=simulateProductOffer(refund,{unitPrice:"3",quantity:2});
  assert.equal(two.upfront,6);
  assert.equal(two.saving,1.5);
  assert.equal(two.netCost,4.5);
  assert.equal(two.netUnitCost,2.25);
  assert.equal(two.realizedPercent,25);
});

test("100% annoncés avec plafond à 1 euro ne produisent jamais un panier gratuit à 4 euros",()=>{
  const simulated=simulateProductOffer({
    scope:"produit",mechanism:"manufacturer_refund",
    savingPercent:100,savingCapAmount:1,requiresUnlock:true
  },{unitPrice:4,quantity:1});
  assert.equal(simulated.status,"estimated");
  assert.equal(simulated.upfront,4);
  assert.equal(simulated.saving,1);
  assert.equal(simulated.netCost,3);
  assert.equal(simulated.realizedPercent,25);
});

test("tous les paliers doivent respecter la quantité, y compris au-dessus du maximum",()=>{
  const offer={scope:"produit",mechanism:"manufacturer_refund",
    savingPercent:30,quantityTiers:[
      {minQty:1,maxQty:2,savingPercent:20},
      {minQty:3,maxQty:4,savingPercent:30}
    ]
  };
  assert.equal(effectiveOfferPercent(offer,1),20);
  assert.equal(effectiveOfferPercent(offer,3),30);
  assert.equal(effectiveOfferPercent(offer,5),null);
  assert.equal(estimateOfferSaving(2,offer,5),null);
  const single=simulateProductOffer(offer,{unitPrice:2,quantity:1});
  assert.equal(single.saving,0.4);
  const three=simulateProductOffer(offer,{unitPrice:2,quantity:3});
  assert.equal(three.saving,1.8);
  const five=simulateProductOffer(offer,{unitPrice:2,quantity:5});
  assert.equal(five.status,"ineligible");
  assert.equal(five.saving,null);
  assert.equal(five.netCost,null);
});

test("quantité minimale obligatoire et remises retailer multi-achat sont respectées",()=>{
  const offer={scope:"produit",savingAmount:1.2,minPurchaseQty:2,
    mechanism:"manufacturer_refund"};
  const short=simulateProductOffer(offer,{unitPrice:4,quantity:1});
  assert.equal(short.status,"quantity");
  assert.equal(short.minimumQuantity,2);
  assert.equal(short.netCost,null);
  const promo=simulateProductOffer({
    scope:"produit",mechanism:"retailer_promo",
    promoFormula:{type:"buy_x_get_y_free",buy:2,free:1}
  },{unitPrice:2,quantity:3});
  assert.equal(promo.saving,2);
  assert.equal(promo.upfront,6);
  assert.equal(promo.netCost,4);
  assert.equal(promo.isRefund,false);
});

test("panier et références sans prix utilisateur sont exclus du scénario fictif",()=>{
  assert.equal(simulateProductOffer({...refund,scope:"panier"},{unitPrice:4,quantity:1}),null);
  assert.equal(simulateProductOffer(refund,{unitPrice:"",quantity:1}),null);
  assert.equal(simulateProductOffer(refund,{unitPrice:"2,56",quantity:"150"}),null);
});

test("le tri au gain en euros préfère le remboursement réellement simulé au 100% plafonné",()=>{
  const expensiveAdvertised={id:"capped",scope:"produit",mechanism:"manufacturer_refund",
    savingPercent:100,savingCapAmount:1};
  const lesserAdvertised={id:"true-savings",scope:"produit",mechanism:"manufacturer_refund",
    savingPercent:30};
  const notEnough={id:"min-qty",scope:"produit",mechanism:"manufacturer_refund",
    savingPercent:80,minPurchaseQty:4};
  const basket={id:"basket",scope:"panier",savingPercent:90};
  const result=rankOffers([basket,notEnough,expensiveAdvertised,lesserAdvertised],
    "estimated",new Date("2026-10-09T10:00:00Z"),{unitPrice:"5,00",quantity:3});
  assert.deepEqual(result.slice(0,2).map(x=>x.id),["true-savings","capped"]);
  assert.deepEqual(new Set(result.slice(2).map(x=>x.id)),new Set(["basket","min-qty"]));
});

test("simulation arrondit aux centimes et ne retourne jamais de gain supérieur au débours",()=>{
  const tiny=simulateProductOffer({...refund,savingAmount:4},
    {unitPrice:"0,99",quantity:1});
  assert.equal(tiny.saving,0.99);
  assert.equal(tiny.netCost,0);
  assert.equal(tiny.realizedPercent,100);
});
