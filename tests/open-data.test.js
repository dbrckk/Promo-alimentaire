import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchPricesByBarcode,
  fetchProductByBarcode,
  isFreshObservation,
  normalizeBarcode,
  normalizePriceObservation
} from "../src/open-data.js";

test("normalizeBarcode nettoie un EAN valide",()=>{
  assert.equal(normalizeBarcode("3017 6240 10701"),"3017624010701");
});

test("normalizeBarcode refuse une longueur invalide",()=>{
  assert.throws(()=>normalizeBarcode("12345"),/8, 12, 13 ou 14/);
});

test("normalizePriceObservation conserve magasin, ville et remise",()=>{
  const value=normalizePriceObservation({
    id:12,product_code:"3017624010701",price:3.49,price_is_discounted:true,
    price_without_discount:4.2,currency:"EUR",date:"2026-10-01",
    location:{osm_brand:"Carrefour",osm_name:"Carrefour Market",osm_address_city:"Lyon",osm_address_postcode:"69003"}
  });
  assert.equal(value.price,3.49);
  assert.equal(value.storeName,"Carrefour Market");
  assert.equal(value.city,"Lyon");
  assert.equal(value.isDiscounted,true);
});

test("isFreshObservation applique la fenêtre de fraîcheur",()=>{
  const now=new Date("2026-10-07T12:00:00Z");
  assert.equal(isFreshObservation({date:"2026-10-01"},120,now),true);
  assert.equal(isFreshObservation({date:"2025-01-01"},120,now),false);
});

test("fetchProductByBarcode normalise la réponse Open Food Facts",async()=>{
  const mockFetch=async()=>({
    ok:true,
    json:async()=>({product:{code:"3017624010701",product_name:"Produit test",brands:"Marque",quantity:"200 g"}})
  });
  const product=await fetchProductByBarcode("3017624010701",mockFetch);
  assert.equal(product.name,"Produit test");
  assert.equal(product.brands,"Marque");
});

test("fetchPricesByBarcode ne garde que l'enseigne demandée",async()=>{
  const mockFetch=async()=>({
    ok:true,
    json:async()=>({total:2,items:[
      {id:1,product_code:"3017624010701",price:2,date:"2026-10-01",location:{osm_brand:"Carrefour"}},
      {id:2,product_code:"3017624010701",price:1.8,date:"2026-10-02",location:{osm_brand:"E.Leclerc"}}
    ]})
  });
  const result=await fetchPricesByBarcode("3017624010701",{store:"leclerc",fetchImpl:mockFetch});
  assert.equal(result.observations.length,1);
  assert.equal(result.observations[0].price,1.8);
});
