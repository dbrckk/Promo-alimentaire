import test from "node:test";
import assert from "node:assert/strict";
import {
  effectiveOfferPercent,
  estimateOfferSaving,
  findProductOffers,
  matchOfferToProduct,
  normalizeText,
  rankMatchedOffers,
  requiredQuantity
} from "../src/matching.js";

test("normalizeText neutralise accents et ponctuation",()=>{
  assert.equal(normalizeText("X.TRA Ultra — Éco"),"x tra ultra eco");
});

test("un EAN explicite donne une correspondance exacte",()=>{
  const result=matchOfferToProduct(
    {code:"3017624010701",name:"Produit"},
    {scope:"produit",eans:["3017624010701"]}
  );
  assert.equal(result.exact,true);
  assert.equal(result.score,100);
});

test("une règle marque + mot clé produit une suggestion probable",()=>{
  const result=matchOfferToProduct(
    {code:"1",name:"Le Chat Discs 24 lavages",brands:"Le Chat",categories:[]},
    {scope:"produit",productMatch:{brands:["Le Chat"],any:["disc","discs"],minScore:60}}
  );
  assert.equal(result.matched,true);
  assert.equal(result.exact,false);
  assert.ok(result.score>=60);
});

test("une mauvaise marque est rejetée",()=>{
  const result=matchOfferToProduct(
    {name:"Lessive Discs",brands:"Autre"},
    {scope:"produit",productMatch:{brands:["Le Chat"],any:["discs"]}}
  );
  assert.equal(result.matched,false);
});

test("findProductOffers respecte l'enseigne et trie l'exact avant l'heuristique",()=>{
  const product={code:"12345678",name:"Mir liquide",brands:"Mir",categories:[]};
  const offers=[
    {id:"probable",scope:"produit",stores:["carrefour"],productMatch:{brands:["Mir"]}},
    {id:"exact",scope:"produit",stores:["carrefour"],eans:["12345678"]},
    {id:"wrong-store",scope:"produit",stores:["leclerc"],eans:["12345678"]}
  ];
  const result=findProductOffers(product,offers,{store:"carrefour"});
  assert.deepEqual(result.map((entry)=>entry.offer.id),["exact","probable"]);
});

test("estimateOfferSaving calcule un potentiel sans dépasser le prix",()=>{
  assert.equal(estimateOfferSaving(4.5,{savingPercent:40}),1.8);
  assert.equal(estimateOfferSaving(2,{savingAmount:3}),2);
});


test("estimateOfferSaving applique le palier de quantité",()=>{
  const offer={
    quantityTiers:[
      {minQty:1,maxQty:1,savingPercent:25},
      {minQty:2,maxQty:2,savingPercent:30},
      {minQty:3,maxQty:null,savingPercent:34}
    ]
  };
  assert.equal(effectiveOfferPercent(offer,1),25);
  assert.equal(effectiveOfferPercent(offer,2),30);
  assert.equal(effectiveOfferPercent(offer,3),34);
  assert.equal(estimateOfferSaving(2,offer,3),2.04);
});


test("un remboursement fixe par offre n'est pas multiplié par la quantité",()=>{
  const offer={savingAmount:1.2,minPurchaseQty:2,savingAmountMode:"per-offer"};
  assert.equal(estimateOfferSaving(4,offer,1),null);
  assert.equal(estimateOfferSaving(4,offer,2),1.2);
  assert.equal(estimateOfferSaving(4,offer,3),1.2);
});

test("un remboursement fixe per-unit peut être multiplié explicitement",()=>{
  const offer={savingAmount:0.5,minPurchaseQty:1,savingAmountMode:"per-unit"};
  assert.equal(estimateOfferSaving(2,offer,3),1.5);
});


test("requiredQuantity utilise la quantité minimale explicite ou du premier palier",()=>{
  assert.equal(requiredQuantity({minPurchaseQty:2}),2);
  assert.equal(requiredQuantity({quantityTiers:[{minQty:3,savingPercent:30},{minQty:5,savingPercent:40}]}),3);
});

test("rankMatchedOffers priorise un EAN exact puis le gain",()=>{
  const matches=[
    {offer:{id:"candidate",savingPercent:50,minPurchaseQty:1},match:{exact:false,confidence:"probable",score:90}},
    {offer:{id:"exact",savingPercent:20,minPurchaseQty:1},match:{exact:true,confidence:"exact",score:100}}
  ];
  const ranked=rankMatchedOffers(matches,{price:10,quantity:1});
  assert.equal(ranked[0].offer.id,"exact");
  assert.equal(ranked[0].action.estimatedSaving,2);
});

test("rankMatchedOffers indique la quantité manquante",()=>{
  const ranked=rankMatchedOffers([
    {offer:{id:"two",savingAmount:1,minPurchaseQty:2},match:{exact:false,confidence:"candidate",score:60}}
  ],{price:4,quantity:1});
  assert.equal(ranked[0].action.quantitySatisfied,false);
  assert.equal(ranked[0].action.missingQty,1);
  assert.equal(ranked[0].action.estimatedSaving,null);
});


test("findProductOffers respecte le canal",()=>{
  const product={code:"1",name:"Mir",brands:"Mir",categories:[]};
  const offers=[
    {id:"store",scope:"produit",stores:["carrefour"],channels:["store"],productMatch:{brands:["Mir"]}},
    {id:"online",scope:"produit",stores:["carrefour"],channels:["online"],productMatch:{brands:["Mir"]}}
  ];
  assert.deepEqual(
    findProductOffers(product,offers,{store:"carrefour",channel:"store"}).map((x)=>x.offer.id),
    ["store"]
  );
});


test("estimateOfferSaving respecte −68% sur le 2e",()=>{
  const offer={
    minPurchaseQty:2,
    promoFormula:{type:"nth_percent",nth:2,cycle:2,percent:68}
  };
  assert.equal(estimateOfferSaving(2.39,offer,1),null);
  assert.equal(estimateOfferSaving(2.39,offer,2),1.63);
  assert.equal(requiredQuantity(offer),2);
});

test("estimateOfferSaving respecte 2+1 offert",()=>{
  const offer={
    promoFormula:{type:"buy_x_get_y_free",buy:2,free:1}
  };
  assert.equal(requiredQuantity(offer),3);
  assert.equal(estimateOfferSaving(1.67,offer,3),1.67);
});


test("un EAN explicitement absent de la liste ne peut pas correspondre heuristiquement",()=>{
  const item={code:"4006381333931",name:"Biscottes Marque",brands:"Marque",categories:[]};
  const offer={
    scope:"produit",
    eans:["3017624010701"],
    productMatch:{brands:["Marque"],any:["Biscottes"]}
  };
  const result=matchOfferToProduct(item,offer);
  assert.equal(result.matched,false);
  assert.equal(result.reason,"ean-not-in-offer");
});

test("un même catalogue peut continuer à reconnaître ses EAN réellement listés",()=>{
  const product={code:"3017624010701",name:"Biscottes Marque",brands:"Marque"};
  const offer={
    scope:"produit",eans:["3017624010701","4006381333931"],
    productMatch:{brands:["Marque"]}
  };
  assert.equal(matchOfferToProduct(product,offer).exact,true);
});

test("une offre de gamme sans EAN conserve les suggestions heuristiques",()=>{
  const product={code:"4006381333931",name:"Biscottes Marque",brands:"Marque"};
  const offer={scope:"produit",productMatch:{brands:["Marque"]}};
  assert.equal(matchOfferToProduct(product,offer).matched,true);
  assert.equal(matchOfferToProduct(product,offer).exact,false);
});
