import test from "node:test";
import assert from "node:assert/strict";
import { createStoreConfirmation } from "../src/local-verification.js";
import {
  compareBasketStores,
  evaluateBasketLocations,
  evaluateBasketStore,
  estimateBasketCandidateSaving,
  normalizeQuantity,
  observationLocationKey,
  selectBestLocationScenario
} from "../src/basket.js";

const product={code:"3017624010701",name:"Produit test",brands:"Marque",categories:[]};
const gift={
  id:"gift",scope:"panier",stores:["carrefour"],savingPercent:4,
  autoStack:true,stackGroup:"payment",savingBasis:"current",stackOrder:30
};

test("normalizeQuantity borne la quantité",()=>{
  assert.equal(normalizeQuantity(0),1);
  assert.equal(normalizeQuantity(3.9),3);
  assert.equal(normalizeQuantity(500),99);
});

test("evaluateBasketStore calcule quantité puis remise panier",()=>{
  const scenario=evaluateBasketStore(
    [{product,quantity:2}],
    {
      store:"carrefour",
      priceByCode:{
        "3017624010701":[{price:5,date:"2026-10-01",storeName:"Carrefour"}]
      },
      offers:[gift],
      now:new Date("2026-10-07T12:00:00Z")
    }
  );
  assert.equal(scenario.observedSubtotal,10);
  assert.equal(scenario.guaranteedSaving,0.4);
  assert.equal(scenario.finalCost,9.6);
  assert.equal(scenario.isComplete,true);
});

test("une référence sans prix rend le scénario incomplet",()=>{
  const scenario=evaluateBasketStore([{product,quantity:1}],{
    store:"leclerc",priceByCode:{},offers:[],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.isComplete,false);
  assert.equal(scenario.missingCount,1);
});

test("une offre produit heuristique reste seulement potentielle",()=>{
  const offer={
    id:"candidate",scope:"produit",stores:["carrefour"],savingPercent:40,
    autoStack:false,productMatch:{brands:["Marque"]}
  };
  const scenario=evaluateBasketStore([{product,quantity:2}],{
    store:"carrefour",
    priceByCode:{"3017624010701":[{price:4,date:"2026-10-01"}]},
    offers:[offer],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.finalCost,8);
  assert.equal(scenario.guaranteedSaving,0);
  assert.equal(scenario.potentialProductSaving,3.2);
});

test("compareBasketStores privilégie un scénario complet",()=>{
  const result=compareBasketStores([
    {store:"carrefour",distinctCount:2,pricedCount:2,isComplete:true,finalCost:20},
    {store:"leclerc",distinctCount:2,pricedCount:1,isComplete:false,finalCost:8}
  ]);
  assert.equal(result[0].store,"carrefour");
});


test("observationLocationKey privilégie locationId",()=>{
  assert.equal(observationLocationKey({locationId:42,storeName:"X"}),"id:42");
});

test("evaluateBasketLocations ne mélange pas deux magasins physiques",()=>{
  const items=[
    {product:{code:"1",name:"A",brands:"",categories:[]},quantity:1},
    {product:{code:"2",name:"B",brands:"",categories:[]},quantity:1}
  ];
  const priceByCode={
    "1":[
      {price:2,date:"2026-10-01",locationId:10,storeName:"Carrefour A"},
      {price:1,date:"2026-10-01",locationId:20,storeName:"Carrefour B"}
    ],
    "2":[
      {price:1,date:"2026-10-01",locationId:10,storeName:"Carrefour A"},
      {price:5,date:"2026-10-01",locationId:20,storeName:"Carrefour B"}
    ]
  };
  const scenarios=evaluateBasketLocations(items,{
    store:"carrefour",
    priceByCode,
    offers:[],
    now:new Date("2026-10-07T12:00:00Z")
  });
  const a=scenarios.find((scenario)=>scenario.location.id===10);
  const b=scenarios.find((scenario)=>scenario.location.id===20);
  assert.equal(a.finalCost,3);
  assert.equal(b.finalCost,6);
});

test("selectBestLocationScenario choisit un magasin complet avant un panier partiel moins cher",()=>{
  const best=selectBestLocationScenario([
    {isComplete:false,pricedCount:1,finalCost:2,location:{distanceKm:1}},
    {isComplete:true,pricedCount:2,finalCost:8,location:{distanceKm:5}}
  ]);
  assert.equal(best.finalCost,8);
  assert.equal(best.isComplete,true);
});


test("evaluateBasketStore expose une offre bundle comme potentiel seulement",()=>{
  const dash={code:"11111111",name:"Dash Pods",brands:"Dash",categories:[]};
  const lenor={code:"22222222",name:"Lenor",brands:"Lenor",categories:[]};
  const bundle={
    id:"bundle",scope:"bundle",stores:["carrefour"],savingPercent:100,savingCapAmount:10,
    bundleRequirements:[
      {id:"dash",minQty:1,productMatch:{brands:["Dash"]}},
      {id:"lenor",minQty:1,productMatch:{brands:["Lenor"]}}
    ],
    bundleTargetRequirementId:"lenor",autoStack:false
  };
  const scenario=evaluateBasketStore([
    {product:dash,quantity:1},
    {product:lenor,quantity:1}
  ],{
    store:"carrefour",
    priceByCode:{
      "11111111":[{price:8,date:"2026-10-01"}],
      "22222222":[{price:6,date:"2026-10-01"}]
    },
    offers:[bundle],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.finalCost,14);
  assert.equal(scenario.guaranteedSaving,0);
  assert.equal(scenario.potentialBundleSaving,6);
  assert.equal(scenario.bundleCandidates.length,1);
});


test("le meilleur cas prudent ne double-compte pas produit et bundle",()=>{
  const product={code:"33333333",name:"Lenor",brands:"Lenor",categories:[]};
  const dash={code:"44444444",name:"Dash",brands:"Dash",categories:[]};
  const productOffer={
    id:"lenor-50",scope:"produit",stores:["carrefour"],savingPercent:50,
    autoStack:false,productMatch:{brands:["Lenor"]}
  };
  const bundle={
    id:"dash-lenor",scope:"bundle",stores:["carrefour"],savingPercent:100,savingCapAmount:10,
    bundleRequirements:[
      {id:"dash",minQty:1,productMatch:{brands:["Dash"]}},
      {id:"lenor",minQty:1,productMatch:{brands:["Lenor"]}}
    ],
    bundleTargetRequirementId:"lenor",autoStack:false
  };
  const scenario=evaluateBasketStore([
    {product:dash,quantity:1},
    {product,quantity:1}
  ],{
    store:"carrefour",
    priceByCode:{
      "44444444":[{price:8,date:"2026-10-01"}],
      "33333333":[{price:6,date:"2026-10-01"}]
    },
    offers:[productOffer,bundle],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.potentialProductSaving,3);
  assert.equal(scenario.potentialBundleSaving,6);
  assert.equal(scenario.conservativePotentialExtraSaving,6);
  assert.equal(scenario.conservativeBestCaseCost,8);
});


test("evaluateBasketStore expose la ventilation des économies",()=>{
  const product={code:"55555555",name:"Produit",brands:"Marque",categories:[]};
  const gift={
    id:"gift",scope:"panier",stores:["carrefour"],savingPercent:4,
    autoStack:true,mechanism:"gift_card",stackGroup:"payment",savingBasis:"current",stackOrder:30
  };
  const scenario=evaluateBasketStore([{product,quantity:1}],{
    store:"carrefour",
    priceByCode:{"55555555":[{price:10,date:"2026-10-01"}]},
    offers:[gift],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.savingsBreakdown.productGuaranteed,0);
  assert.equal(scenario.savingsBreakdown.paymentGuaranteed,0.4);
  assert.equal(scenario.savingsBreakdown.otherBasketGuaranteed,0);
});


test("estimateBasketCandidateSaving calcule un cashback panier potentiel",()=>{
  assert.equal(estimateBasketCandidateSaving(100,{savingPercent:2.5}),2.5);
  assert.equal(estimateBasketCandidateSaving(2,{savingAmount:3}),2);
});

test("le meilleur cas prudent tient compte d'un cashback panier incertain sans le cumuler",()=>{
  const product={code:"66666666",name:"Produit",brands:"Marque",categories:[]};
  const productOffer={
    id:"product",scope:"produit",stores:["carrefour"],channels:["online"],
    savingPercent:20,autoStack:false,productMatch:{brands:["Marque"]}
  };
  const webCashback={
    id:"web",scope:"panier",stores:["carrefour"],channels:["online"],
    savingPercent:2.5,autoStack:false,mechanism:"affiliate_cashback"
  };
  const scenario=evaluateBasketStore([{product,quantity:1}],{
    store:"carrefour",channel:"online",
    priceByCode:{"66666666":[{price:100,date:"2026-10-01"}]},
    offers:[productOffer,webCashback],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.potentialProductSaving,20);
  assert.equal(scenario.savingsBreakdown.basketPotential,2.5);
  assert.equal(scenario.conservativePotentialExtraSaving,20);
  assert.equal(scenario.conservativeBestCaseCost,80);
});


test("une ligne expose sa meilleure ODR candidate avec niveau de correspondance",()=>{
  const exactOffer={
    id:"exact",scope:"produit",stores:["carrefour"],eans:["3017624010701"],
    savingPercent:20,autoStack:false
  };
  const heuristicOffer={
    id:"heuristic",scope:"produit",stores:["carrefour"],
    productMatch:{brands:["Marque"]},savingPercent:50,autoStack:false
  };
  const scenario=evaluateBasketStore([{product,quantity:1}],{
    store:"carrefour",
    priceByCode:{"3017624010701":[{price:10,date:"2026-10-01"}]},
    offers:[heuristicOffer,exactOffer],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.lines[0].bestProductCandidate.offer.id,"exact");
  assert.equal(scenario.lines[0].bestProductCandidate.match.exact,true);
  assert.equal(scenario.lines[0].bestProductCandidate.saving,2);
});


test("Club Carrefour applique 10% sur un produit Carrefour Bio",()=>{
  const bio={
    code:"77777777",name:"Pâtes bio",brands:"Carrefour Bio",categories:[]
  };
  const scenario=evaluateBasketStore([{product:bio,quantity:1}],{
    store:"carrefour",
    loyaltyProfile:{carrefour:"club",leclerc:"unknown"},
    priceByCode:{"77777777":[{price:10,date:"2026-10-01"}]},
    offers:[],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.guaranteedSaving,1);
  assert.equal(scenario.finalCost,9);
  assert.equal(scenario.lines[0].bestProductCandidate.offer.mechanism,"retailer_loyalty");
});

test("Carte PASS applique 15% au lieu de 10%",()=>{
  const bio={
    code:"88888888",name:"Riz bio",brands:"Carrefour Bio",categories:[]
  };
  const scenario=evaluateBasketStore([{product:bio,quantity:1}],{
    store:"carrefour",
    loyaltyProfile:{carrefour:"pass"},
    priceByCode:{"88888888":[{price:20,date:"2026-10-01"}]},
    offers:[],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.guaranteedSaving,3);
  assert.equal(scenario.finalCost,17);
});

test("profil Carrefour inconnu laisse l'avantage seulement potentiel",()=>{
  const bio={
    code:"99999999",name:"Produit bio",brands:"Carrefour Bio",categories:[]
  };
  const scenario=evaluateBasketStore([{product:bio,quantity:1}],{
    store:"carrefour",
    loyaltyProfile:{carrefour:"unknown"},
    priceByCode:{"99999999":[{price:10,date:"2026-10-01"}]},
    offers:[],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.guaranteedSaving,0);
  assert.equal(scenario.potentialProductSaving,1);
});

test("Ticket E.Leclerc exige la carte si l'offre le demande",()=>{
  const leclercOffer={
    id:"ticket",scope:"produit",stores:["leclerc"],channels:["store"],
    eans:["3017624010701"],savingPercent:20,
    mechanism:"retailer_loyalty",requiresLoyalty:"leclerc-card",
    autoStack:false,autoStackWhenEligible:true,
    stackGroup:"leclerc-ticket",savingBasis:"current",stackOrder:20
  };
  const without=evaluateBasketStore([{product,quantity:1}],{
    store:"leclerc",
    loyaltyProfile:{leclerc:"none"},
    priceByCode:{"3017624010701":[{price:10,date:"2026-10-01"}]},
    offers:[leclercOffer],
    now:new Date("2026-10-07T12:00:00Z")
  });
  const withCard=evaluateBasketStore([{product,quantity:1}],{
    store:"leclerc",
    loyaltyProfile:{leclerc:"card"},
    priceByCode:{"3017624010701":[{price:10,date:"2026-10-01"}]},
    offers:[leclercOffer],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(without.guaranteedSaving,0);
  assert.equal(withCard.guaranteedSaving,2);
});


test("PASS sépare prix caisse et cagnotte fidélité",()=>{
  const bio={
    code:"10101010",name:"Produit Bio",brands:"Carrefour Bio",categories:[]
  };
  const scenario=evaluateBasketStore([{product:bio,quantity:1}],{
    store:"carrefour",
    loyaltyProfile:{carrefour:"pass"},
    priceByCode:{"10101010":[{price:20,date:"2026-10-01"}]},
    offers:[],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.checkoutCost,20);
  assert.equal(scenario.loyaltyCredit,3);
  assert.equal(scenario.finalCost,17);
  assert.equal(scenario.savingsBreakdown.loyaltyGuaranteed,3);
});

test("une remise immédiate garantie baisse le prix caisse",()=>{
  const exactPromo={
    id:"instant",scope:"produit",stores:["carrefour"],eans:["3017624010701"],
    savingPercent:20,mechanism:"retailer_promo",autoStack:true,
    stackGroup:"retailer-promo",savingBasis:"current",stackOrder:10
  };
  const scenario=evaluateBasketStore([{product,quantity:1}],{
    store:"carrefour",
    priceByCode:{"3017624010701":[{price:10,date:"2026-10-01"}]},
    offers:[exactPromo],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.checkoutCost,8);
  assert.equal(scenario.loyaltyCredit,0);
  assert.equal(scenario.finalCost,8);
});


test("le gain potentiel maximal ne se limite pas à la correspondance la plus sûre",()=>{
  const p={code:"12121212",name:"Produit Marque",brands:"Marque",categories:[]};
  const exact={
    id:"exact",scope:"produit",stores:["carrefour"],eans:["12121212"],
    savingPercent:10,autoStack:false
  };
  const bigger={
    id:"bigger",scope:"produit",stores:["carrefour"],
    productMatch:{brands:["Marque"]},savingPercent:50,autoStack:false
  };
  const scenario=evaluateBasketStore([{product:p,quantity:1}],{
    store:"carrefour",
    priceByCode:{"12121212":[{price:10,date:"2026-10-01"}]},
    offers:[bigger,exact],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.lines[0].bestProductCandidate.offer.id,"exact");
  assert.equal(scenario.lines[0].bestSavingCandidate.offer.id,"bigger");
  assert.equal(scenario.potentialProductSaving,5);
});


test("une promo EAN exacte confirmée dans le magasin devient garantie",()=>{
  const promo={
    id:"local-promo",
    scope:"produit",
    stores:["leclerc"],
    channels:["store"],
    eans:["3017624010701"],
    savingPercent:20,
    mechanism:"retailer_promo",
    requiresStoreVerification:true,
    autoStack:false,
    stackGroup:"retailer-promo",
    savingBasis:"current",
    expiresAt:"2026-10-10"
  };
  const confirmation=createStoreConfirmation(promo,{
    store:"leclerc",
    locationKey:"id:42",
    locationName:"E.Leclerc Test",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  const scenario=evaluateBasketStore([{product,quantity:1}],{
    store:"leclerc",
    channel:"store",
    storeVerificationKey:"id:42",
    storeConfirmations:[confirmation],
    priceByCode:{"3017624010701":[{price:10,date:"2026-10-07"}]},
    offers:[promo],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.guaranteedSaving,2);
  assert.equal(scenario.finalCost,8);
});

test("la même confirmation ne garantit rien dans un autre magasin",()=>{
  const promo={
    id:"local-promo-2",
    scope:"produit",
    stores:["leclerc"],
    channels:["store"],
    eans:["3017624010701"],
    savingPercent:20,
    mechanism:"retailer_promo",
    requiresStoreVerification:true,
    autoStack:false,
    stackGroup:"retailer-promo",
    savingBasis:"current",
    expiresAt:"2026-10-10"
  };
  const confirmation=createStoreConfirmation(promo,{
    store:"leclerc",
    locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  const scenario=evaluateBasketStore([{product,quantity:1}],{
    store:"leclerc",
    channel:"store",
    storeVerificationKey:"id:99",
    storeConfirmations:[confirmation],
    priceByCode:{"3017624010701":[{price:10,date:"2026-10-07"}]},
    offers:[promo],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.guaranteedSaving,0);
});


test("une promo confirmée −68% sur le 2e ne surcompte pas une quantité impaire",()=>{
  const promo={
    id:"second-68",
    scope:"produit",
    stores:["leclerc"],
    channels:["store"],
    eans:["3017624010701"],
    savingPercent:34,
    promoFormula:{type:"nth_percent",nth:2,cycle:2,percent:68},
    mechanism:"retailer_promo",
    requiresStoreVerification:true,
    autoStack:false,
    stackGroup:"retailer-promo",
    savingBasis:"base",
    expiresAt:"2026-10-10"
  };
  const confirmation=createStoreConfirmation(promo,{
    store:"leclerc",
    locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  const scenario=evaluateBasketStore([{product,quantity:3}],{
    store:"leclerc",
    channel:"store",
    storeVerificationKey:"id:42",
    storeConfirmations:[confirmation],
    priceByCode:{"3017624010701":[{price:2.39,date:"2026-10-07"}]},
    offers:[promo],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.observedSubtotal,7.17);
  assert.equal(scenario.guaranteedSaving,1.63);
  assert.equal(scenario.finalCost,5.54);
});

test("une promo confirmée 2+1 offert calcule exactement le nombre de groupes",()=>{
  const promo={
    id:"two-plus-one",
    scope:"produit",
    stores:["leclerc"],
    channels:["store"],
    eans:["3017624010701"],
    savingPercent:33.33,
    promoFormula:{type:"buy_x_get_y_free",buy:2,free:1},
    mechanism:"retailer_promo",
    requiresStoreVerification:true,
    autoStack:false,
    stackGroup:"retailer-promo",
    savingBasis:"base",
    expiresAt:"2026-10-10"
  };
  const confirmation=createStoreConfirmation(promo,{
    store:"leclerc",
    locationKey:"id:42",
    confirmedAt:new Date("2026-10-07T10:00:00Z")
  });
  const scenario=evaluateBasketStore([{product,quantity:4}],{
    store:"leclerc",
    channel:"store",
    storeVerificationKey:"id:42",
    storeConfirmations:[confirmation],
    priceByCode:{"3017624010701":[{price:1.67,date:"2026-10-07"}]},
    offers:[promo],
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(scenario.observedSubtotal,6.68);
  assert.equal(scenario.guaranteedSaving,1.67);
  assert.equal(scenario.finalCost,5.01);
});
