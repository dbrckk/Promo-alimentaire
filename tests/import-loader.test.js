import test from "node:test";
import assert from "node:assert/strict";
import { loadImportedOffers, mergeOffers, offerIdentity } from "../src/import-loader.js";

const manifest={verifiedAt:"2026-10-07",files:["one.json"]};
const payload=[{
  providerId:"shopmium",externalId:"x",title:"Offre",
  stores:["all"],savingPercent:20,verifiedAt:"2026-10-07",
  startsAt:"2026-10-01",expiresAt:"2026-10-31",
  sourceUrl:"https://example.com/offer",productMatch:{brands:["Test"]}
}];

test("loadImportedOffers valide et filtre les lots actifs",async()=>{
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json")) return {ok:true,json:async()=>manifest};
    if(text.endsWith("/one.json")) return {ok:true,json:async()=>payload};
    return {ok:false,status:404,json:async()=>({})};
  };
  const result=await loadImportedOffers({
    fetchImpl,
    now:new Date("2026-10-07T12:00:00Z")
  });
  assert.equal(result.offers.length,1);
  assert.equal(result.offers[0].id,"shopmium-x");
  assert.equal(result.errors.length,0);
  assert.equal(result.sourceStats.length,1);
  assert.equal(result.sourceStats[0].activeCount,1);
  assert.equal(result.sourceStats[0].providerIds[0],"shopmium");
});

test("loadImportedOffers masque une offre expirée",async()=>{
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json")) return {ok:true,json:async()=>manifest};
    return {ok:true,json:async()=>payload};
  };
  const result=await loadImportedOffers({
    fetchImpl,
    now:new Date("2026-11-05T12:00:00Z")
  });
  assert.equal(result.offers.length,0);
});

test("mergeOffers remplace un id existant par l'import",()=>{
  const result=mergeOffers(
    [{id:"a",title:"ancien"}],
    [{id:"a",title:"nouveau"},{id:"b",title:"autre"}]
  );
  assert.equal(result.length,2);
  assert.equal(result.find((x)=>x.id==="a").title,"nouveau");
});


test("loadImportedOffers marque une source expirée comme stale",async()=>{
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json")) return {ok:true,json:async()=>manifest};
    return {ok:true,json:async()=>payload};
  };
  const result=await loadImportedOffers({
    fetchImpl,
    now:new Date("2026-11-05T12:00:00Z")
  });
  assert.equal(result.sourceStats[0].status,"stale");
  assert.equal(result.sourceStats[0].activeCount,0);
});


test("loadImportedOffers expose le mode automatique/manuelle du snapshot",async()=>{
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json")) {
      return {ok:true,json:async()=>({verifiedAt:"2026-10-07",files:["one-auto.json","manual-2026.json"]})};
    }
    return {ok:true,json:async()=>payload};
  };
  const result=await loadImportedOffers({fetchImpl,now:new Date("2026-10-07T12:00:00Z")});
  assert.equal(result.sourceStats[0].mode,"automatic");
  assert.equal(result.sourceStats[1].mode,"manual");
});


test("loadImportedOffers expose la qualité de preuve produit du snapshot",async()=>{
  const qualityPayload=[
    {
      providerId:"leclerc",externalId:"exact",title:"Exact",
      stores:["leclerc"],savingPercent:20,verifiedAt:"2026-10-07",
      expiresAt:"2026-10-31",sourceUrl:"https://example.com/exact",
      eans:["4006381333931"],eanEvidenceUrl:"https://example.com/ean",
      requiresStoreVerification:true
    },
    {
      providerId:"leclerc",externalId:"heuristic",title:"Heuristique",
      stores:["leclerc"],savingPercent:20,verifiedAt:"2026-10-07",
      expiresAt:"2026-10-31",sourceUrl:"https://example.com/h",
      productMatch:{brands:["Marque"]},
      eanResolutionBlocked:true,
      eanResolutionReason:"Gamme ambiguë."
    }
  ];
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json")){
      return {ok:true,json:async()=>({verifiedAt:"2026-10-07",files:["quality.json"]})};
    }
    return {ok:true,json:async()=>qualityPayload};
  };
  const result=await loadImportedOffers({
    fetchImpl,
    now:new Date("2026-10-07T12:00:00Z")
  });
  const stats=result.sourceStats[0];
  assert.equal(stats.exactEanCount,1);
  assert.equal(stats.heuristicCount,1);
  assert.equal(stats.resolutionBlockedCount,1);
  assert.equal(stats.storeVerificationCount,1);
});


test("un taux paiement importé remplace son fallback statique sans doublon",()=>{
  const base=[{
    id:"widilo-old",providerId:"widilo",scope:"panier",
    mechanism:"gift_card",stores:["carrefour"],channels:["store"],savingPercent:3
  },{
    id:"leclerc-product",providerId:"leclerc",scope:"produit",
    stores:["leclerc"],savingPercent:20
  }];
  const imported=[{
    id:"widilo-latest",providerId:"widilo",scope:"panier",
    mechanism:"gift_card",stores:["carrefour"],channels:["store"],savingPercent:4
  }];
  const result=mergeOffers(base,imported);
  assert.equal(result.length,2);
  assert.equal(result.find((x)=>x.providerId==="widilo").savingPercent,4);
  assert.equal(offerIdentity(imported[0]),offerIdentity(base[0]));
});

test("les ODR différentes du même fournisseur restent distinctes",()=>{
  const result=mergeOffers([],[
    {id:"offer-a",providerId:"shopmium",scope:"produit",stores:["all"]},
    {id:"offer-b",providerId:"shopmium",scope:"produit",stores:["all"]}
  ]);
  assert.equal(result.length,2);
});

test("les statistiques EAN ne comptent plus les promotions expirées",async()=>{
  const payload=[
    {
      providerId:"leclerc",externalId:"old",title:"Ancienne promo",
      stores:["leclerc"],savingPercent:20,
      verifiedAt:"2026-09-01",expiresAt:"2026-09-15",
      sourceUrl:"https://example.com/old",
      eans:["4006381333931"],eanEvidenceUrl:"https://example.com/ean",
      requiresStoreVerification:true
    },
    {
      providerId:"leclerc",externalId:"active",title:"Promo actuelle",
      stores:["leclerc"],savingPercent:20,
      verifiedAt:"2026-10-07",expiresAt:"2026-10-31",
      sourceUrl:"https://example.com/current",
      productMatch:{brands:["Test"]}
    }
  ];
  const fetchImpl=async(url)=>String(url).endsWith("/index.json")
    ? {ok:true,json:async()=>({files:["quality.json"]})}
    : {ok:true,json:async()=>payload};
  const result=await loadImportedOffers({
    fetchImpl,now:new Date("2026-10-08T12:00:00Z")
  });
  const s=result.sourceStats[0];
  assert.equal(s.activeCount,1);
  assert.equal(s.exactEanCount,0);
  assert.equal(s.heuristicCount,1);
  assert.equal(s.storeVerificationCount,0);
});


test("un échec public est visible sans rafraîchir les offres ni les dates",async()=>{
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json"))return {ok:true,json:async()=>manifest};
    if(text.endsWith("/source-sync-status.json"))return {ok:true,json:async()=>({
      sources:{shopmium:{
        status:"unavailable",checkedAt:"2026-10-08T12:00:00Z",
        reason:"Aucune offre publique récupérée"
      }}
    })};
    return {ok:true,json:async()=>payload};
  };
  const result=await loadImportedOffers({
    fetchImpl,now:new Date("2026-10-08T14:00:00Z")
  });
  assert.equal(result.offers.length,1);
  assert.equal(result.offers[0].verifiedAt,"2026-10-07");
  assert.equal(result.sourceStats[0].status,"sync-warning");
  assert.equal(result.sourceStats[0].syncState.status,"unavailable");
  assert.equal(result.sourceStats[0].syncState.reason,"Aucune offre publique récupérée");
});

test("l'absence de fichier diagnostic ne bloque pas les imports",async()=>{
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json"))return {ok:true,json:async()=>manifest};
    if(text.endsWith("/source-sync-status.json"))return {ok:false,status:404};
    return {ok:true,json:async()=>payload};
  };
  const result=await loadImportedOffers({
    fetchImpl,now:new Date("2026-10-08T12:00:00Z")
  });
  assert.equal(result.offers.length,1);
  assert.equal(result.sourceStats[0].syncState,undefined);
});


test("un contrôle partiel d'une enseigne garde les offres mais affiche une alerte",async()=>{
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json"))return {ok:true,json:async()=>manifest};
    if(text.endsWith("/source-sync-status.json"))return {ok:true,json:async()=>({
      sources:{shopmium:{
        status:"partial",checkedAt:"2026-10-08T12:00:00Z",
        reason:"2/5 offres seulement"
      }}
    })};
    return {ok:true,json:async()=>payload};
  };
  const result=await loadImportedOffers({
    fetchImpl,now:new Date("2026-10-08T14:00:00Z")
  });
  assert.equal(result.sourceStats[0].status,"sync-warning");
  assert.equal(result.sourceStats[0].syncState.status,"partial");
  assert.equal(result.offers.length,1);
});
