import test from "node:test";
import assert from "node:assert/strict";
import { loadImportedOffers, mergeOffers, offerIdentity, sourceDeadlineSummary, failedRefreshWarning } from "../src/import-loader.js";

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
      eans:["4006381333931"],eanEvidenceUrl:"https://www.e.leclerc/fp/produit-4006381333931",
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
      eans:["4006381333931"],eanEvidenceUrl:"https://www.e.leclerc/fp/produit-4006381333931",
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

test("le panneau de fraîcheur n'annonce pas une panne antérieure à la preuve active",async()=>{
  const now=new Date("2026-10-12T15:00:00Z");
  const fresh=[{
    providerId:"coupon-network",externalId:"new-proof",title:"Alimentaire prouvé",
    stores:["all"],savingPercent:25,verifiedAt:"2026-10-12",
    reviewAfter:"2026-10-25",sourceUrl:"https://www.couponnetwork.fr/"
  }];
  const check=async(checkedAt)=>{
    const fetchImpl=async(url)=>{
      const file=String(url);
      if(file.endsWith("/index.json"))return {ok:true,json:async()=>({
        files:["coupon-network-auto.json"]
      })};
      if(file.endsWith("/coupon-network-auto.json"))return {
        ok:true,json:async()=>fresh
      };
      if(file.endsWith("/source-sync-status.json"))return {
        ok:true,json:async()=>({sources:{"coupon-network":{
          status:"unavailable",checkedAt,reason:"Dernier contrôle sans accès",
          extractedCount:0,previousSnapshotCount:1
        }}})
      };
      return {ok:false,status:404};
    };
    return loadImportedOffers({fetchImpl,now});
  };
  for(const checkedAt of [
    "2026-10-11T12:00:00Z",
    "2026-10-13T09:00:00Z"
  ]){
    const result=await check(checkedAt);
    assert.equal(result.offers.length,1);
    assert.equal(result.offers[0].sourceSyncWarning,undefined);
    assert.equal(result.sourceStats[0].status,"ok",
      "Un échec avant la preuve ou daté du futur ne rend pas l'offre obsolète");
    assert.equal(result.sourceStats[0].syncState,undefined);
  }

  // When the prior proof is older than the actual failed check, the
  // conservative guard is unchanged: no renewed automatic saving.
  fresh[0].verifiedAt="2026-10-10";
  const affected=await check("2026-10-12T12:00:00Z");
  assert.equal(affected.offers[0].sourceSyncWarning.status,"unavailable");
  assert.equal(affected.sourceStats[0].status,"sync-warning");
  assert.equal(affected.sourceStats[0].syncState.checkedAt,"2026-10-12T12:00:00Z");
  assert.equal(affected.offers[0].autoStack,false);
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


test("les diagnostics par enseigne priment sur le fichier historique partagé",async()=>{
  const fetchImpl=async(url)=>{
    const text=String(url);
    if(text.endsWith("/index.json"))return {ok:true,json:async()=>manifest};
    if(text.endsWith("/source-sync-status.json"))return {ok:true,json:async()=>({
      sources:{shopmium:{
        status:"unavailable",checkedAt:"2026-10-07T12:00:00Z",
        reason:"Ancien avertissement"
      }}
    })};
    if(text.endsWith("/source-sync-carrefour.json"))return {ok:true,json:async()=>({
      sources:{shopmium:{
        status:"partial",checkedAt:"2026-10-08T13:00:00Z",
        reason:"Nouvel état vérifié"
      }}
    })};
    if(text.endsWith("/source-sync-leclerc.json"))return {ok:true,json:async()=>({
      sources:{}
    })};
    return {ok:true,json:async()=>payload};
  };
  const result=await loadImportedOffers({
    fetchImpl,now:new Date("2026-10-08T14:00:00Z")
  });
  assert.equal(result.offers.length,1);
  assert.equal(result.sourceStats[0].syncState.status,"partial");
  assert.equal(result.sourceStats[0].syncState.reason,"Nouvel état vérifié");
});


test("le statut Shopmium spécifique masque uniquement les offres non reconfirmées",async()=>{
  const offer={
    providerId:"shopmium",externalId:"food",title:"Promo alimentaire Shopmium",
    stores:["all"],scope:"produit",savingPercent:30,
    verifiedAt:"2026-10-09",reviewAfter:"2026-10-14",
    sourceUrl:"https://offers.shopmium.com/fr/n/kiri-6",
    autoStack:false
  };
  const now=new Date("2026-10-11T20:00:00Z");
  const fetchImpl=async(url)=>{
    const file=String(url);
    if(file.endsWith("/index.json")){
      return {ok:true,json:async()=>({files:["shopmium-auto.json"]})};
    }
    if(file.endsWith("/shopmium-auto.json")){
      return {ok:true,json:async()=>[offer]};
    }
    if(file.endsWith("/source-sync-status.json")){
      return {ok:true,json:async()=>({sources:{shopmium:{
        status:"updated",checkedAt:"2026-10-10T11:00:00Z",
        reason:"ancienne réussite"
      }}})};
    }
    if(file.endsWith("/source-sync-shopmium.json")){
      return {ok:true,json:async()=>({sources:{shopmium:{
        status:"unavailable",checkedAt:"2026-10-11T18:30:00Z",
        reason:"Accès public temporairement indisponible",
        extractedCount:0,previousSnapshotCount:1
      }}})};
    }
    return {ok:false,status:404};
  };
  const result=await loadImportedOffers({fetchImpl,now});
  assert.equal(result.offers.length,1);
  assert.equal(result.offers[0].verifiedAt,"2026-10-09");
  assert.equal(result.offers[0].sourceSyncWarning.status,"unavailable");
  assert.equal(result.sourceStats[0].status,"sync-warning");
  assert.equal(result.sourceStats[0].syncState.confirmedCount,0);
  assert.equal(result.sourceStats[0].syncState.previousSnapshotCount,1);
  // After the original review window, even a source outage must not
  // resurrect the old cashback or extend its public validity.
  const expired=await loadImportedOffers({
    fetchImpl,now:new Date("2026-10-16T12:00:00Z")
  });
  assert.equal(expired.offers.length,0);
  assert.equal(expired.sourceStats[0].status,"stale");
});

test("une source indisponible conserve un indicateur indépendant de révision proche",async()=>{
  // The sync actually ran before the check: future-dated failures cannot
  // be treated as already observed outages.
  const today=new Date("2026-10-08T16:00:00Z");
  const sourceOffers=[{
    providerId:"leclerc",externalId:"candidate",title:"Ticket test",
    stores:["leclerc"],scope:"produit",savingPercent:20,
    verifiedAt:"2026-10-07",reviewAfter:"2026-10-09",
    sourceUrl:"https://www.e.leclerc/"
  }];
  const fetchImpl=async(url)=>{
    const name=String(url);
    if(name.endsWith("/index.json")){
      return {ok:true,json:async()=>({files:["leclerc-auto.json"]})};
    }
    if(name.endsWith("/source-sync-leclerc.json")){
      return {ok:true,json:async()=>({sources:{leclerc:{
        status:"unavailable",checkedAt:"2026-10-08T14:08:55Z",
        reason:"Pages catalogue indisponibles",
        extractedCount:0,previousSnapshotCount:5
      }}})};
    }
    if(name.endsWith("/leclerc-auto.json")){
      return {ok:true,json:async()=>sourceOffers};
    }
    return {ok:false,status:404};
  };
  const current=await loadImportedOffers({fetchImpl,now:today});
  assert.equal(current.offers.length,1);
  const stat=current.sourceStats[0];
  assert.equal(stat.status,"sync-warning");
  assert.equal(stat.validityStatus,"review-soon");
  assert.equal(stat.nextDeadline,"2026-10-09");
  assert.equal(stat.syncState.confirmedCount,0);
  assert.equal(stat.syncState.previousSnapshotCount,5);

  const expired=await loadImportedOffers({
    fetchImpl,now:new Date("2026-10-11T12:00:00Z")
  });
  assert.equal(expired.offers.length,0);
  assert.equal(expired.sourceStats[0].status,"stale");
  assert.equal(expired.sourceStats[0].validityStatus,"stale");
});

test("la fiche Shopmium affiche l'échéance de revue plutôt qu'une fausse fin lointaine",async()=>{
  const offer={
    providerId:"shopmium",externalId:"watch",title:"Offre à revalider",
    stores:["all"],scope:"produit",savingPercent:30,verifiedAt:"2026-10-09",
    expiresAt:"2026-12-31",sourceUrl:"https://offers.shopmium.com/fr/n/kiri-6"
  };
  const fetchImpl=async(url)=>{
    const target=String(url);
    if(target.endsWith("/index.json")) return {ok:true,json:async()=>({files:["shopmium-auto.json"]})};
    if(target.endsWith("/shopmium-auto.json")) return {ok:true,json:async()=>[offer]};
    return {ok:false,status:404};
  };
  const current=await loadImportedOffers({
    fetchImpl,now:new Date("2026-10-09T12:00:00Z")
  });
  assert.equal(current.offers.length,1);
  assert.equal(current.sourceStats[0].nextDeadline,"2026-10-14");
  assert.equal(current.sourceStats[0].status,"ok");
  const stale=await loadImportedOffers({
    fetchImpl,now:new Date("2026-10-15T12:00:00Z")
  });
  assert.equal(stale.offers.length,0);
  assert.equal(stale.sourceStats[0].status,"stale");
  assert.equal(stale.sourceStats[0].nextDeadline,null);
});

test("les échéances de sources suivent minuit Paris et les horodatages précis",async()=>{
  const makeFetch=(fields)=>async(url)=>{
    const name=String(url);
    if(name.endsWith("/index.json")) return {
      ok:true,json:async()=>({files:["calendar-auto.json"]})
    };
    if(name.endsWith("/calendar-auto.json")) return {
      ok:true,json:async()=>[{
        providerId:"coupon-network",externalId:"paris-deadline",
        title:"Produit alimentaire confirmé",stores:["all"],savingPercent:30,
        sourceUrl:"https://www.couponnetwork.fr/",
        verifiedAt:"2026-10-11",...fields
      }]
    };
    return {ok:false,status:404};
  };
  const dated=makeFetch({reviewAfter:"2026-10-12"});
  const lastMoment=await loadImportedOffers({
    fetchImpl:dated,now:new Date("2026-10-12T21:59:59.999Z")
  });
  assert.equal(lastMoment.offers.length,1);
  assert.equal(lastMoment.sourceStats[0].nextDeadline,"2026-10-12");
  assert.equal(lastMoment.sourceStats[0].daysUntil,0,
    "La révision est aujourd'hui en France et non dans un jour UTC");
  assert.equal(lastMoment.sourceStats[0].status,"review-soon");
  const nextParisDay=await loadImportedOffers({
    fetchImpl:dated,now:new Date("2026-10-12T22:00:00Z")
  });
  assert.equal(nextParisDay.offers.length,0);
  assert.equal(nextParisDay.sourceStats[0].status,"stale");
  assert.equal(nextParisDay.sourceStats[0].nextDeadline,null,
    "Ne pas annoncer un contrôle futur pour une offre déjà expirée localement");

  const timestamp=makeFetch({reviewAfter:"2026-10-12T23:15:00Z"});
  const timestamped=await loadImportedOffers({
    fetchImpl:timestamp,now:new Date("2026-10-12T12:00:00Z")
  });
  assert.equal(timestamped.offers.length,1);
  assert.equal(timestamped.sourceStats[0].nextDeadline,"2026-10-13",
    "Un instant UTC du 12 octobre est déjà le 13 en France");
  assert.equal(timestamped.sourceStats[0].daysUntil,1);

  const dstSpring=makeFetch({
    verifiedAt:"2026-03-28",reviewAfter:"2026-03-29"
  });
  const daylight=await loadImportedOffers({
    fetchImpl:dstSpring,now:new Date("2026-03-28T23:20:00Z")
  });
  assert.equal(daylight.offers.length,1);
  assert.equal(daylight.sourceStats[0].nextDeadline,"2026-03-29");
  assert.equal(daylight.sourceStats[0].daysUntil,0,
    "La journée de passage à l'heure d'été a 23 h, pas 24 h");
});

test("un manifeste distant ne peut charger ni chemins ni URLs arbitraires",async()=>{
  const {inspectImportManifest}=await import("../src/import-manifest.js");
  assert.deepEqual(inspectImportManifest({files:["one.json","shopmium-auto.json"]}).files,
    ["one.json","shopmium-auto.json"]);
  const malicious=[
    "../other.json","/x.json","http://evil.example/x.json",
    "https://evil.example/x.json","../secret/offer.json",
    "one.json?token=x","one.json#fragment","a\\\\b.json",
    "index.json","source-sync-status.json","source-sync-other.json",
    "ONE.JSON","one.json%2Fother.json","épreuve.json","-bad.json"
  ];
  for(const name of malicious){
    assert.equal(inspectImportManifest({files:[name]}).ok,false,name);
  }
  assert.equal(inspectImportManifest({files:["one.json","one.json"]}).ok,false);
  assert.equal(inspectImportManifest({files:Array.from({length:61},(_,i)=>"source-"+i+".json")}).ok,false);
  assert.equal(inspectImportManifest({files:null}).ok,false);

  let calls=0;
  const fetchImpl=async(url)=>{
    calls+=1;
    assert.equal(new URL(url).pathname.endsWith("/data/import/index.json"),true);
    return {ok:true,json:async()=>({
      files:["one.json","../secret.json"]
    })};
  };
  await assert.rejects(
    loadImportedOffers({fetchImpl,now:new Date("2026-10-11T12:00:00Z")}),
    /Manifeste d'offres refusé/
  );
  assert.equal(calls,1,"Aucun autre fichier ou statut source n'est demandé");
});

test("même calendrier et mêmes échecs source dans la PWA et GitHub Actions",()=>{
  const live={
    providerId:"coupon-network",externalId:"live-source",id:"coupon-network-live-source",
    verifiedAt:"2026-10-12",reviewAfter:"2026-10-12",
    expiresAt:"2026-12-31"
  };
  const archived={
    providerId:"coupon-network",externalId:"old",id:"coupon-network-old",
    verifiedAt:"2026-10-01",reviewAfter:"2026-10-09",
    expiresAt:"2026-12-31"
  };
  const before=new Date("2026-10-12T21:59:59.999Z");
  assert.deepEqual(sourceDeadlineSummary([live,archived],before),{
    nextDeadline:"2026-10-12",daysUntil:0
  });
  const after=new Date("2026-10-12T22:00:00Z");
  assert.deepEqual(sourceDeadlineSummary([live,archived],after),{
    nextDeadline:null,daysUntil:null
  });
  const precise={
    ...live,reviewAfter:"2026-10-12T23:15:00Z"
  };
  assert.deepEqual(sourceDeadlineSummary([precise,archived],
    new Date("2026-10-12T12:00:00Z")),{
    nextDeadline:"2026-10-13",daysUntil:1
  });
  const shopmium={...live,providerId:"shopmium",
    verifiedAt:"2026-10-09",reviewAfter:null,expiresAt:"2026-11-20"};
  assert.deepEqual(sourceDeadlineSummary([shopmium],
    new Date("2026-10-12T12:00:00Z")),{
    nextDeadline:"2026-10-14",daysUntil:2
  });
  const oldFailure={
    "coupon-network":{status:"unavailable",checkedAt:"2026-10-11T10:00:00Z"}
  };
  assert.equal(failedRefreshWarning(live,oldFailure,before),null,
    "Un échec antérieur à la preuve ne dégrade pas les économies récentes");
  const laterFailure={
    "coupon-network":{status:"unavailable",checkedAt:"2026-10-12T13:00:00Z"}
  };
  assert.equal(failedRefreshWarning(live,laterFailure,before)?.status,"unavailable");
  const futureFailure={
    "coupon-network":{status:"partial",checkedAt:"2026-10-13T09:00:00Z"}
  };
  assert.equal(failedRefreshWarning(live,futureFailure,before),null);
});
