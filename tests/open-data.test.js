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


test("selectBestRecentPrice utilise le prix le plus récent, même s'il a augmenté",()=>{
  const now=new Date("2026-10-07T12:00:00Z");
  const best=selectBestRecentPrice([
    {price:3.2,date:"2026-10-05",storeName:"A"},
    {price:2.9,date:"2026-10-01",storeName:"B"},
    {price:1.5,date:"2025-01-01",storeName:"Ancien"}
  ],120,now);
  assert.equal(best.storeName,"A");
  assert.equal(best.price,3.2);
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


test("une ancienne promotion ne remplace pas un relevé normal récent du même magasin",()=>{
  const now=new Date("2026-10-08T12:00:00Z");
  const current=selectBestRecentPrice([
    {id:1,price:1.11,date:"2026-10-01",isDiscounted:true,locationId:42},
    {id:2,price:1.59,date:"2026-10-07",isDiscounted:false,locationId:42}
  ],120,now);
  assert.equal(current.price,1.59);
  assert.equal(current.isDiscounted,false);
});

test("à la même date, des relevés contradictoires utilisent le prix le plus prudent",()=>{
  const now=new Date("2026-10-08T12:00:00Z");
  const current=selectBestRecentPrice([
    {price:2.3,date:"2026-10-07"},
    {price:3.1,date:"2026-10-07",proofType:"RECEIPT"},
    {price:1,date:"2026-10-07"}
  ],120,now);
  assert.equal(current.price,3.1);
});

test("un prix récent sans preuve n'écarte pas un autre prix du même jour mieux étayé",()=>{
  const now=new Date("2026-10-08T12:00:00Z");
  const current=selectBestRecentPrice([
    {id:"b",price:3.1,date:"2026-10-07",proofType:"RECEIPT"},
    {id:"a",price:3.1,date:"2026-10-07",proofType:null}
  ],120,now);
  assert.equal(current.proofType,"RECEIPT");
});

test("le prix ancien reste utilisable comme indicatif en absence d'un relevé récent",()=>{
  const now=new Date("2026-10-08T12:00:00Z");
  const current=selectBestRecentPrice([
    {price:4.5,date:"2026-07-20"},
    {price:3.5,date:"2026-06-10"}
  ],120,now);
  assert.equal(current.price,4.5);
});

test("la géolocalisation absente est rejetée avant l'appel réseau",async()=>{
  let called=false;
  for(const coords of [
    {latitude:null,longitude:null},
    {latitude:"",longitude:""},
    {latitude:45.4,longitude:null},
    {lat:undefined,lon:4.3}
  ]){
    await assert.rejects(
      fetchPricesByBarcode("3017624010701",{
        store:"carrefour",coords,
        fetchImpl:async()=>{called=true;throw Error("network called");}
      }),
      /Coordonnées géographiques invalides/
    );
  }
  assert.equal(called,false);
});

test("haversine ne convertit pas des coordonnées manquantes en zéro",()=>{
  assert.equal(haversineKm(null,4,45,4),null);
  assert.equal(haversineKm(45,undefined,45,4),null);
  assert.equal(haversineKm(91,4,45,4),null);
  assert.equal(haversineKm(45,4,45,4),0);
});


test("Open Prices recherche une deuxième page lorsque les références locales manquent",async()=>{
  const code="3017624010701";
  const pages=[];
  const source=(id,price,per="UNIT")=>({
    id,product_code:code,price,currency:"EUR",
    price_per:per,date:"2026-10-07",location:{
      osm_brand:"Carrefour",osm_lat:45.44,osm_lon:4.39
    }
  });
  const result=await fetchPricesByBarcode(code,{
    store:"carrefour",size:2,maxPages:3,minimumMatches:3,
    coords:{latitude:45.44,longitude:4.39},
    fetchImpl:async(url)=>{
      const u=new URL(url);
      const page=Number(u.searchParams.get("page")||1);
      pages.push(page);
      return {ok:true,json:async()=>({
        pages:3,total:6,
        items:page===1
          ? [source(1,2),source(2,4,"KILOGRAM")]
          : page===2
            ? [source(3,3),source(4,2.5)]
            : [source(5,7)]
      })};
    }
  });
  assert.deepEqual(pages,[1,2]);
  assert.equal(result.pagesFetched,2);
  assert.equal(result.partial,false);
  assert.equal(result.moreAvailable,true);
  assert.equal(result.searchIncomplete,true);
  assert.deepEqual(result.observations.map((item)=>item.id),[1,3,4]);
  assert.equal(result.observations.every((item)=>item.pricePer==="UNIT"),true);
});

test("le moteur refuse le prix au kilogramme pour un produit vendu à la pièce",async()=>{
  const code="3017624010701";
  const result=await fetchPricesByBarcode(code,{
    store:"carrefour",maxPages:1,
    fetchImpl:async()=>({ok:true,json:async()=>({
      items:[{id:1,product_code:code,currency:"EUR",price:4,price_per:"KILOGRAM",
        date:"2026-10-07",location:{osm_brand:"Carrefour"}}]
    })})
  });
  assert.equal(result.observations.length,0);
});

test("une erreur de la page suivante ne perd pas les prix de la première",async()=>{
  const code="3017624010701";
  const urls=[];
  const result=await fetchPricesByBarcode(code,{
    store:"carrefour",size:1,maxPages:3,
    fetchImpl:async(url)=>{
      urls.push(String(url));
      if(urls.length===2) return {ok:false,status:503};
      return {ok:true,json:async()=>({
        pages:4,total:4,
        items:[{id:1,product_code:code,price:2,currency:"EUR",
          date:"2026-10-07",location:{osm_brand:"Carrefour"}}]
      })};
    }
  });
  assert.equal(urls.length,2);
  assert.equal(new URL(urls[1]).searchParams.get("page"),"2");
  assert.equal(result.partial,true);
  assert.equal(result.searchIncomplete,true);
  assert.equal(result.pagesFetched,1);
  assert.deepEqual(result.observations.map((item)=>item.id),[1]);
});

test("Open Prices déduplique les relevés répétés entre pages",async()=>{
  const code="3017624010701";
  const source={id:101,product_code:code,price:2,currency:"EUR",
    date:"2026-10-07",location:{osm_brand:"Carrefour"}};
  let calls=0;
  const result=await fetchPricesByBarcode(code,{
    store:"carrefour",size:1,maxPages:2,minimumMatches:3,
    fetchImpl:async()=>{calls+=1;return {ok:true,json:async()=>({
      pages:2,total:2,items:[source]
    })};}
  });
  assert.equal(calls,2);
  assert.equal(result.observations.length,1);
});

test("la recherche paginée reste plafonnée à trois appels",async()=>{
  const code="3017624010701";
  let calls=0;
  const result=await fetchPricesByBarcode(code,{
    store:"leclerc",size:1,maxPages:999,
    fetchImpl:async()=>{calls+=1;return {
      ok:true,json:async()=>({pages:999,total:999,items:[{
        id:calls,product_code:code,price:1,currency:"EUR",
        date:"2026-10-07",location:{osm_brand:"Carrefour"}
      }]})
    };}
  });
  assert.equal(calls,3);
  assert.equal(result.pagesFetched,3);
  assert.equal(result.moreAvailable,true);
  assert.equal(result.searchIncomplete,true);
});


test("des magasins distincts sans identifiant serveur restent deux relevés",async()=>{
  const code="3017624010701";
  const result=await fetchPricesByBarcode(code,{
    store:"carrefour",size:2,maxPages:1,
    fetchImpl:async()=>({ok:true,json:async()=>({items:[
      {product_code:code,price:2,currency:"EUR",date:"2026-10-07",
        location:{osm_brand:"Carrefour",osm_name:"Carrefour A",osm_address_postcode:"69003"}},
      {product_code:code,price:2,currency:"EUR",date:"2026-10-07",
        location:{osm_brand:"Carrefour",osm_name:"Carrefour B",osm_address_postcode:"69005"}}
    ]})})
  });
  assert.equal(result.observations.length,2);
  assert.deepEqual(result.observations.map(x=>x.storeName).sort(),["Carrefour A","Carrefour B"]);
});

test("Open Food Facts refuse une fiche répondant pour un autre GTIN",async()=>{
  const wrong=async()=>({
    ok:true,json:async()=>({product:{code:"4006381333931",product_name:"Autre produit"}})
  });
  await assert.rejects(
    ()=>fetchProductByBarcode("3017624010701",wrong),
    /autre code-barres/
  );
});

test("Open Food Facts accepte UPC-A et EAN-13 équivalents",async()=>{
  const alias=async()=>({
    ok:true,json:async()=>({product:{
      code:"0036000291452",product_name:"Même produit",brands:"Marque"
    }})
  });
  const item=await fetchProductByBarcode("036000291452",alias);
  assert.equal(item.code,"0036000291452");
});

test("Open Prices reconnaît le même GTIN sous forme UPC-A, EAN-13 ou GTIN-14",async()=>{
  const fetchImpl=async()=>({
    ok:true,json:async()=>({total:3,items:[
      {id:1,product_code:"036000291452",price:1.5,currency:"EUR",date:"2026-10-08",
        location:{osm_brand:"Carrefour"}},
      {id:2,product_code:"00036000291452",price:1.6,currency:"EUR",date:"2026-10-08",
        location:{osm_brand:"Carrefour"}},
      {id:3,product_code:"4006381333931",price:0.1,currency:"EUR",date:"2026-10-08",
        location:{osm_brand:"Carrefour"}}
    ]})
  });
  const result=await fetchPricesByBarcode("0036000291452",{
    store:"carrefour",fetchImpl
  });
  assert.equal(result.observations.length,2);
  assert.deepEqual(result.observations.map(x=>x.price).sort(),[1.5,1.6]);
});

test("recherche Open Prices complète : aucune pagination restante annoncée",async()=>{
  const code="3017624010701";
  const response=await fetchPricesByBarcode(code,{
    store:"carrefour",
    fetchImpl:async()=>({ok:true,json:async()=>({
      total:1,pages:1,items:[{
        id:42,product_code:code,price:2.9,currency:"EUR",
        date:"2026-10-08",location:{osm_brand:"Carrefour"}
      }]
    })})
  });
  assert.equal(response.moreAvailable,false);
  assert.equal(response.partial,false);
  assert.equal(response.searchIncomplete,false);
  assert.equal(response.pagesFetched,1);
});

test("une page pleine sans métadonnées de pagination ne prouve pas l'exhaustivité",async()=>{
  const code="3017624010701";
  const result=await fetchPricesByBarcode(code,{
    store:"carrefour",size:1,maxPages:1,
    fetchImpl:async()=>({ok:true,json:async()=>({items:[{
      id:42,product_code:code,price:2.9,currency:"EUR",
      date:"2026-10-08",location:{osm_brand:"Carrefour"}
    }]})})
  });
  assert.equal(result.moreAvailable,true);
  assert.equal(result.searchIncomplete,true);
});
