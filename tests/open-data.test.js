import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchPricesByBarcode,
  fetchProductByBarcode,
  isFreshObservation,
  isUnambiguousRetailer,
  normalizeBarcode,
  normalizePriceObservation,
  haversineKm,
  observationAgeDays,
  priceFreshness,
  selectBestRecentPrice
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
  assert.equal(value.locationId,null);
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


test("fetchPricesByBarcode ajoute lat lon et rayon seulement sur demande",async()=>{
  let capturedUrl="";
  const mockFetch=async(url)=>{
    capturedUrl=String(url);
    return {ok:true,json:async()=>({total:0,items:[]})};
  };
  await fetchPricesByBarcode("3017624010701",{
    store:"carrefour",
    coords:{latitude:45.4397,longitude:4.3872},
    radiusKm:25,
    fetchImpl:mockFetch
  });
  const url=new URL(capturedUrl);
  assert.equal(url.searchParams.get("lat"),"45.4397");
  assert.equal(url.searchParams.get("lon"),"4.3872");
  assert.equal(url.searchParams.get("radius_km"),"25");
  assert.equal(url.searchParams.get("product_code"),"3017624010701");
});

test("fetchPricesByBarcode refuse des coordonnées invalides",async()=>{
  await assert.rejects(
    fetchPricesByBarcode("3017624010701",{
      store:"carrefour",
      coords:{latitude:200,longitude:4},
      fetchImpl:async()=>{throw new Error("ne doit pas être appelé");}
    }),
    /Coordonnées géographiques invalides/
  );
});


test("haversineKm retourne zéro au même point",()=>{
  assert.equal(haversineKm(45.44,4.39,45.44,4.39),0);
});

test("normalizePriceObservation calcule la distance si la position est fournie",()=>{
  const value=normalizePriceObservation({
    id:99,price:2,date:"2026-10-01",
    location:{osm_brand:"Carrefour",osm_lat:45.44,osm_lon:4.39}
  },{latitude:45.44,longitude:4.39});
  assert.equal(value.distanceKm,0);
  assert.equal(value.locationLat,45.44);
});


test("selectBestRecentPrice choisit le prix récent le plus bas",()=>{
  const now=new Date("2026-10-07T12:00:00Z");
  const best=selectBestRecentPrice([
    {price:3.2,date:"2026-10-05",storeName:"A"},
    {price:2.9,date:"2026-10-01",storeName:"B"},
    {price:1.5,date:"2025-01-01",storeName:"Ancien"}
  ],120,now);
  assert.equal(best.storeName,"B");
  assert.equal(best.price,2.9);
});


test("selectBestRecentPrice préfère la fenêtre de 30 jours si elle existe",()=>{
  const now=new Date("2026-10-07T12:00:00Z");
  const best=selectBestRecentPrice([
    {price:1,date:"2026-07-15",storeName:"Ancien moins cher"},
    {price:2,date:"2026-10-01",storeName:"Récent"}
  ],120,now,30);
  assert.equal(best.storeName,"Récent");
});

test("priceFreshness expose un âge et un niveau",()=>{
  const now=new Date("2026-10-07T12:00:00Z");
  assert.equal(observationAgeDays({date:"2026-10-05"},now),2);
  assert.equal(priceFreshness({date:"2026-10-05"},now).level,"very-recent");
  assert.equal(priceFreshness({date:"2026-08-01"},now).level,"old");
});


test("une géolocalisation absente ne devient jamais un faux magasin à (0,0)",()=>{
  for(const location of [
    {osm_brand:"Carrefour"},
    {osm_brand:"Carrefour",osm_lat:null,osm_lon:null},
    {osm_brand:"Carrefour",osm_lat:"",osm_lon:""},
    {osm_brand:"Carrefour",osm_lat:45.44,osm_lon:null}
  ]){
    const value=normalizePriceObservation({
      id:21,product_code:"3017624010701",price:2,date:"2026-10-07",location
    },{latitude:46,longitude:4});
    assert.equal(value.locationLat,null);
    assert.equal(value.locationLon,null);
    assert.equal(value.distanceKm,null);
  }
});

test("un prix normal absent ne devient pas un prix barré à zéro",()=>{
  for(const value of [null,undefined,""]){
    const result=normalizePriceObservation({
      id:21,price:3,date:"2026-10-07",price_without_discount:value
    });
    assert.equal(result.priceWithoutDiscount,null);
  }
});

test("une réponse Open Prices corrompue ne mélange pas produits, monnaies ou prix",async()=>{
  const code="3017624010701";
  const result=await fetchPricesByBarcode(code,{
    store:"carrefour",
    fetchImpl:async()=>({
      ok:true,json:async()=>({total:5,items:[
        {id:1,product_code:code,price:2,date:"2026-10-07",currency:"EUR",location:{osm_brand:"Carrefour"}},
        {id:2,product_code:"4006381333931",price:1,date:"2026-10-07",currency:"EUR",location:{osm_brand:"Carrefour"}},
        {id:3,product_code:code,price:1,date:"2026-10-07",currency:"USD",location:{osm_brand:"Carrefour"}},
        {id:4,product_code:code,price:-1,date:"2026-10-07",currency:"EUR",location:{osm_brand:"Carrefour"}},
        {id:5,product_code:code,price:1,date:"2026-10-07",currency:"EUR",location:{osm_brand:"E.Leclerc"}}
      ]})
    })
  });
  assert.deepEqual(result.observations.map((observation)=>observation.id),[1]);
});


test("la recherche autour de moi exclut les observations sans position ou trop éloignées",async()=>{
  const code="3017624010701";
  const observations=[
    {id:1,product_code:code,price:2,date:"2026-10-07",location:{osm_brand:"Carrefour",osm_lat:45.440,osm_lon:4.390}},
    {id:2,product_code:code,price:1,date:"2026-10-07",location:{osm_brand:"Carrefour",osm_lat:48.857,osm_lon:2.352}},
    {id:3,product_code:code,price:0.5,date:"2026-10-07",location:{osm_brand:"Carrefour"}}
  ];
  const result=await fetchPricesByBarcode(code,{
    store:"carrefour",
    coords:{latitude:45.44,longitude:4.39},
    radiusKm:25,
    fetchImpl:async()=>({ok:true,json:async()=>({items:observations,total:3})})
  });
  assert.deepEqual(result.observations.map((x)=>x.id),[1]);
});

test("une fiche d'enseigne ambiguë n'est pas comptée deux fois",()=>{
  assert.equal(isUnambiguousRetailer("Carrefour Market · Carrefour","carrefour"),true);
  assert.equal(isUnambiguousRetailer("E.Leclerc · Carrefour","carrefour"),false);
  assert.equal(isUnambiguousRetailer("E.Leclerc · Carrefour","leclerc"),false);
  assert.equal(isUnambiguousRetailer("E.Leclerc","leclerc"),true);
});


test("le prix barré supérieur au prix payé signale une promotion malgré un indicateur manquant",()=>{
  const observation=normalizePriceObservation({
    id:9,product_code:"3017624010701",price:7,
    price_without_discount:10,price_is_discounted:false,
    date:"2026-10-07",location:{osm_brand:"Carrefour"}
  });
  assert.equal(observation.isDiscounted,true);
  assert.equal(observation.priceWithoutDiscount,10);
  const plain=normalizePriceObservation({
    id:10,price:7,price_without_discount:7
  });
  assert.equal(plain.isDiscounted,false);
});
