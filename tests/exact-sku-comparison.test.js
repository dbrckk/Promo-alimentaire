import test from "node:test";
import assert from "node:assert/strict";
import {compareExactSku} from "../src/exact-sku-comparison.js";

const CODE="3017624010701";
const OTHER="4006381333931";
const now=new Date("2026-10-09T12:00:00Z");
const valid=(id,store,extras={})=>({
  id,title:id,scope:"produit",provider:store==="carrefour"?"Carrefour":"E.Leclerc",
  providerId:store,mechanism:"manufacturer_refund",eans:[CODE],
  eanEvidenceUrl:store==="carrefour"
    ? "https://www.carrefour.fr/p/produit-3017624010701"
    : "https://www.e.leclerc/fp/produit-3017624010701",
  stores:[store],channels:["store"],savingPercent:20,...extras
});
const observation=(store,price,code=CODE,extras={})=>({
  productCode:code,price,date:"2026-10-08",
  retailerText:store==="carrefour"?"Carrefour Chalon":"E.Leclerc Chalon",
  storeName:store==="carrefour"?"Carrefour Chalon":"E.Leclerc Chalon",
  city:"Chalon-sur-Saône",currency:"EUR",pricePer:"UNIT",...extras
});

test("comparateur sépare précisément prix et offres pour un EAN commun",()=>{
  const offers=[
    valid("carrefour-exact","carrefour",{savingPercent:30}),
    valid("leclerc-exact","leclerc",{savingPercent:15}),
    valid("incorrect-ean","carrefour",{eans:[OTHER],productMatch:{brands:["Test"]}}),
    {id:"heuristic",title:"Marque Test",scope:"produit",
      stores:["carrefour","leclerc"],productMatch:{brands:["Test"]},savingPercent:100},
    valid("wrong-channel","carrefour",{channels:["drive"],savingPercent:90})
  ];
  const comparison=compareExactSku({code:CODE,name:"Test",brands:"Test"},offers,{
    carrefour:[observation("carrefour",3.49),observation("leclerc",0.7),observation("carrefour",1.2,OTHER)],
    leclerc:[observation("leclerc",3.59),observation("carrefour",0.6)]
  },{channel:"store",now});
  assert.equal(comparison.status,"ok");
  assert.equal(comparison.gtin,"03017624010701");
  assert.equal(comparison.lowerObservedStore,"carrefour");
  const [c,l]=comparison.stores;
  assert.equal(c.price,3.49);
  assert.equal(l.price,3.59);
  assert.deepEqual(c.exactOffers.map(o=>o.id),["carrefour-exact"]);
  assert.deepEqual(l.exactOffers.map(o=>o.id),["leclerc-exact"]);
  assert.equal(c.exactOffers[0].retailerProof,true);
  assert.equal(l.exactOffers[0].retailerProof,true);
  assert.equal(c.exactOffers[0].saving,1.05);
  assert.equal(c.exactOffers[0].amountAfterRefund,2.44);
});

test("plusieurs mécanismes sur même EAN restent alternatifs, jamais cumulés",()=>{
  const c=valid("one","carrefour",{savingPercent:40});
  const d=valid("two","carrefour",{savingPercent:25});
  const res=compareExactSku({code:CODE},[c,d],{
    carrefour:[observation("carrefour",10)]
  },{now});
  assert.equal(res.stores[0].exactCount,2);
  assert.equal(res.stores[0].potentialSaving,4);
  assert.equal(res.stores[0].possibleNetCost,6);
  assert.equal(res.stores[1].price,null);
  assert.equal(res.stores[1].exactCount,0);
});

test("observation déjà remisée ou prix canal non confirmé : pas de second gain",()=>{
  const offers=[
    valid("plain","carrefour"),
    valid("needs-channel","carrefour",{requiresChannelPriceVerification:true})
  ];
  const discounted=compareExactSku({code:CODE},offers,{
    carrefour:[observation("carrefour",4.5,CODE,{isDiscounted:true})]
  },{now});
  assert.equal(discounted.stores[0].price,4.5);
  assert.equal(discounted.stores[0].potentialSaving,null);
  assert.ok(discounted.stores[0].exactOffers.every(x=>x.saving===null));
  const regular=compareExactSku({code:CODE},offers,{
    carrefour:[observation("carrefour",4.5)]
  },{now});
  const channel=regular.stores[0].exactOffers.find(x=>x.id==="needs-channel");
  assert.equal(channel.saving,null);
  assert.equal(channel.status,"retailer-price-required");
  assert.equal(regular.stores[0].potentialSaving,0.9);
});

test("Drive ne réutilise jamais les relevés des magasins physiques",()=>{
  const drive=valid("drive","carrefour",{channels:["drive"]});
  const res=compareExactSku({code:CODE},[drive],{
    carrefour:[observation("carrefour",5)]
  },{channel:"drive",now});
  assert.equal(res.stores[0].exactCount,1);
  assert.equal(res.stores[0].price,null);
  assert.equal(res.stores[0].potentialSaving,null);
  assert.match(res.stores[0].note,/Aucun prix magasin/);
});

test("les GTIN UPC-A/EAN-13/GTIN14 représentent une même référence",()=>{
  const one="036000291452";
  const long="00036000291452";
  const offer=valid("upc","leclerc",{eans:[one],
    eanEvidenceUrl:"https://www.e.leclerc/fp/test-036000291452"});
  const res=compareExactSku({code:long},[offer],{
    leclerc:[observation("leclerc",5,long)]
  },{now});
  assert.equal(res.status,"ok");
  assert.equal(res.stores[1].exactOffers.length,1);
  assert.equal(res.stores[1].exactOffers[0].retailerProof,true);
});

test("dates anciennes, autres enseignes et GTIN invalides ne produisent aucun prix utilisable",()=>{
  const res=compareExactSku({code:CODE},[
    valid("expired","carrefour",{expiresAt:"2026-10-08"})
  ],{
    carrefour:[observation("carrefour",1,CODE,{date:"2026-03-01"}),
      observation("carrefour",2,OTHER),
      observation("leclerc",4,CODE)]
  },{now});
  assert.equal(res.stores[0].price,null);
  assert.equal(res.stores[0].exactCount,0);
  assert.equal(compareExactSku({code:"invalid"},[],{},{}).status,"invalid-gtin");
  assert.equal(compareExactSku({code:CODE},[],{}, {quantity:0}).status,"invalid-quantity");
});

test("sans preuves de prix, aucun magasin gagnant n'est inventé",()=>{
  const res=compareExactSku({code:CODE},[],{carrefour:[observation("carrefour",3)]},{now});
  assert.equal(res.lowerObservedStore,null);
  assert.equal(res.stores[0].price,3);
  assert.equal(res.stores[1].price,null);
});

test("une promo propre au distributeur n'est jamais déduite d'un prix communautaire",()=>{
  const row=compareExactSku({code:CODE},[
    valid("retailer","carrefour",{
      mechanism:"retailer_promo",savingPercent:50
    })
  ],{
    carrefour:[observation("carrefour",4.2)]
  },{now}).stores[0];
  assert.equal(row.price,4.2);
  assert.equal(row.potentialSaving,null);
  assert.equal(row.possibleNetCost,null);
  assert.equal(row.exactOffers[0].status,"retailer-price-required");
});
