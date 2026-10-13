import {confirmPublicDailyCampaign} from "../scripts/daily-campaign-evidence.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import { loadImportedOffers, mergeOffers, offerIdentity, sourceDeadlineSummary, failedRefreshWarning, sourceRefreshImpact } from "../src/import-loader.js";
import {selectDailyCatalogue} from "../src/daily-catalogue.js";

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
  assert.equal(result.sourceStats[0].syncAffectedCount,1);
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
    assert.equal(result.sourceStats[0].syncAffectedCount,0);
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

test("l'impact d'une synchronisation échouée exclut preuves nouvelles et campagnes expirées",()=>{
  const now=new Date("2026-10-12T14:00:00Z");
  const offer=(id,providerId,verifiedAt,reviewAfter="2026-10-20")=>({
    id,providerId,verifiedAt,reviewAfter,expiresAt:"2026-10-31"
  });
  const offers=[
    offer("old-cn","coupon-network","2026-10-10"),
    offer("fresh-cn","coupon-network","2026-10-12"),
    offer("old-shop","shopmium","2026-10-09","2026-10-20"),
    offer("expired","coupon-network","2026-10-01","2026-10-09")
  ];
  const sources={
    "coupon-network":{
      status:"unavailable",checkedAt:"2026-10-11T12:00:00Z"
    },
    "shopmium":{
      status:"partial",checkedAt:"2026-10-11T08:00:00Z"
    }
  };
  assert.deepEqual(sourceRefreshImpact(offers,sources,now),{
    affectedCount:2,
    unaffectedCount:1,
    affectedProviderIds:["coupon-network","shopmium"]
  });
  assert.deepEqual(sourceRefreshImpact(offers,{
    "coupon-network":{status:"unavailable",checkedAt:"2026-10-13T08:00:00Z"}
  },now),{
    affectedCount:0,
    unaffectedCount:3,
    affectedProviderIds:[]
  });
});

test("le manifeste distingue archives documentées et sources actives",async()=>{
  const {inspectImportManifest}=await import("../src/import-manifest.js");
  const valid=inspectImportManifest({
    files:["carrefour-promotions-auto.json","shopmium-auto.json"],
    archivedOnly:{"carrefour-promotions-auto.json":
      "Onze campagnes historiques expirées, gardées comme preuve."}
  });
  assert.equal(valid.ok,true);
  assert.deepEqual(valid.files,["carrefour-promotions-auto.json","shopmium-auto.json"]);
  assert.equal(valid.archivedOnly["carrefour-promotions-auto.json"].startsWith("Onze"),true);

  for(const invalid of [
    {files:["live.json"],archivedOnly:{"other.json":"Missing in manifest"}},
    {files:["live.json"],archivedOnly:{"live.json":""}},
    {files:["live.json"],archivedOnly:{"live.json":"x".repeat(241)}},
    {files:["live.json"],archivedOnly:["live.json"]},
    {files:["live.json"],archivedOnly:"live.json"}
  ]){
    assert.equal(inspectImportManifest(invalid).ok,false,
      "Une exception archive erronée ne doit pas neutraliser le contrôle strict");
  }
});

test("la vérification planifiée stricte accepte une archive sans masquer une offre active",async()=>{
  // Verify the real CLI against isolated data. The production catalog changes
  // daily and must not break a regression merely by refreshing campaign dates.
  const dir=await mkdtemp(join(tmpdir(),"promo-freshness-"));
  const writeJson=(name,value)=>
    writeFile(join(dir,name),JSON.stringify(value,null,2)+"\n","utf8");
  const archived=Array.from({length:11},(_,index)=>({
    ...payload[0],providerId:"carrefour",externalId:"expired-"+index,
    stores:["carrefour"],verifiedAt:"2026-10-07",
    reviewAfter:"2026-10-09",expiresAt:"2026-10-09"
  }));
  const live=Array.from({length:2},(_,index)=>({
    ...payload[0],providerId:"coupon-network",externalId:"live-"+index,
    verifiedAt:"2026-10-11",reviewAfter:"2026-10-19",
    sourceUrl:"https://www.couponnetwork.fr/"
  }));
  const env={...process.env,NODE_ENV:"test",
    PROMO_FRESHNESS_FIXTURE_DIR:dir,
    CHECK_DATE:"2026-10-12T17:53:14.000Z"};
  const check=()=>execFileSync(process.execPath,
    ["scripts/check-import-freshness.mjs","--strict"],{
      cwd:new URL("../",import.meta.url),env,encoding:"utf8"
    });
  try{
    await writeJson("index.json",{
      verifiedAt:"2026-10-12",
      files:["carrefour-promotions-auto.json","coupon-network-auto.json"],
      archivedOnly:{
        "carrefour-promotions-auto.json":"Campagnes antérieures archivées pour audit"
      }
    });
    await writeJson("carrefour-promotions-auto.json",archived);
    await writeJson("coupon-network-auto.json",live);
    const output=check();
    assert.match(output,/carrefour-promotions-auto\.json: archived · 0\/11 actives/);
    assert.match(output,/coupon-network-auto\.json: ok · 2\/2 actives/);
    assert.match(output,/1 fichier\(s\) en archive historique explicite/);
    assert.match(output,/0 fichier\(s\) périmé\(s\)\/invalide\(s\)/);

    // The archive exemption must fail if an active campaign slips inside.
    await writeJson("carrefour-promotions-auto.json",[
      ...archived.slice(0,10),{
        ...archived[10],externalId:"active-but-marked-archive",
        verifiedAt:"2026-10-12",reviewAfter:"2026-10-15",
        expiresAt:"2026-10-15"
      }
    ]);
    assert.throws(check,/Command failed/,
      "Une archive contenant une offre active doit échouer en mode strict");
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});

test("analyse du catalogue : vrais relevés enseigne séparés des remboursements et campagnes",()=>{
  const now=new Date("2026-10-12T17:00:00Z");
  const leclerc={id:"leclerc-live",providerId:"leclerc",provider:"E.Leclerc",
    title:"Mini-nems du catalogue",scope:"produit",category:"traiteur",
    stores:["leclerc"],channels:["store"],verifiedAt:"2026-10-12",
    expiresAt:"2026-10-17",basePrice:2.99,savingPercent:20,
    eans:["3564700602706"],eanEvidenceUrl:"https://www.e.leclerc/fp/nems",
    sourceUrl:"https://nos-catalogues-promos-v2.e.leclerc/catalog/26G133G/1006",
    requiresStoreVerification:true,rewardType:"loyalty_credit"};
  const coupon={id:"coupon-live",providerId:"coupon-network",
    title:"Carottes Bonduelle",scope:"produit",category:"alimentaire",
    stores:["all"],verifiedAt:"2026-10-12",reviewAfter:"2026-10-19",
    savingAmount:.2,sourceUrl:"https://www.couponnetwork.fr/"};
  const stale={...leclerc,id:"leclerc-stale",sourceSyncWarning:{status:"unavailable"}};
  const expired={...leclerc,id:"leclerc-expired",reviewAfter:"2026-10-11"};
  const forbidden={...leclerc,id:"nonfood-low",category:"hygiene",savingPercent:35};
  const campaigns=[{id:"fresh-ecatalogue",store:"leclerc",channels:["store"],
    title:"Campagne alimentaire",claim:"Sélection épicerie",verifiedAt:"2026-10-12",
    expiresAt:"2026-10-17",sourceUrl:
      "https://nos-catalogues-promos-v2.e.leclerc/catalog/26G133G/0637",
    category:"alimentaire"}];
  const result=selectDailyCatalogue({offers:[
    leclerc,coupon,stale,expired,forbidden],campaigns,store:"leclerc",
    channel:"store",now});
  assert.deepEqual(result.retailer.map(x=>x.id),["leclerc-live"]);
  assert.equal(result.retailer[0].savingAmount,.60);
  assert.equal(result.retailer[0].rewardType,"loyalty_credit");
  assert.equal(result.retailer[0].candidate,true);
  assert.deepEqual(result.extra.map(x=>x.id),["coupon-live"]);
  assert.equal(result.campaigns.length,1);
  assert.equal(result.campaigns[0].status,"campaign-only");
  assert.equal("savingAmount" in result.campaigns[0],false);
  const channelMismatch=selectDailyCatalogue({offers:[leclerc],
    campaigns,store:"leclerc",channel:"drive",now});
  assert.equal(channelMismatch.retailer.length,0);
  assert.equal(channelMismatch.campaigns.length,0);
});
test("campagnes du jour : échéance Paris, URL officielle, future proof et 50 % hors alimentaire",()=>{
  const eligible={id:"carrefour-bio",store:"carrefour",channels:["store"],
    title:"Bio",claim:"Jusqu'à 60% sur le second",verifiedAt:"2026-10-12",
    startsAt:"2026-10-12",expiresAt:"2026-10-12",
    sourceUrl:"https://www.carrefour.fr/offres-du-moment",category:"alimentaire"};
  const invalid=[
    {...eligible,id:"future",verifiedAt:"2026-10-13"},
    {...eligible,id:"past",expiresAt:"2026-10-11"},
    {...eligible,id:"fake",sourceUrl:"https://www.carrefour.fr.evil.example/offers"},
    {...eligible,id:"javascript",sourceUrl:"javascript:alert(1)"},
    {...eligible,id:"nonfood-49",category:"non-alimentaire",advertisedMaxPercent:49},
    {...eligible,id:"nonfood-60-only-advertised",category:"non-alimentaire",advertisedMaxPercent:60},
    {...eligible,id:"bad-date",expiresAt:"2026-02-30"}
  ];
  const before=selectDailyCatalogue({offers:[],campaigns:[eligible,...invalid],
    store:"carrefour",channel:"store",now:new Date("2026-10-12T21:59:59Z")});
  assert.deepEqual(before.campaigns.map(c=>c.id),["carrefour-bio"]);
  const after=selectDailyCatalogue({offers:[],campaigns:[eligible,...invalid],
    store:"carrefour",channel:"store",now:new Date("2026-10-12T22:00:00Z")});
  assert.equal(after.campaigns.length,0);
});
test("promo sur le 2e : taux effectif et coût d'un lot, sans attribuer la remise au panier entier",()=>{
  const result=selectDailyCatalogue({offers:[{
    id:"deal-two",providerId:"leclerc",title:"Réduction second article",
    stores:["leclerc"],channels:["store"],scope:"produit",
    verifiedAt:"2026-10-12",reviewAfter:"2026-10-15",
    basePrice:4,savingPercent:60,promoFormula:{type:"nth_percent",nth:2,percent:60},
    sourceUrl:"https://www.e.leclerc/"}],now:new Date("2026-10-12T12:00:00Z"),
    store:"leclerc",channel:"store"});
  assert.equal(result.retailer[0].minQuantity,2);
  assert.equal(result.retailer[0].savingPercent,30);
  assert.equal(result.retailer[0].savingAmount,2.4);
});

test("catalogue quotidien : vraies meilleures économies et budget payé avant remboursement",()=>{
  const at=new Date("2026-10-12T12:00:00Z");
  const source=(id,basePrice,savingPercent,extra={})=>({
    id,providerId:"leclerc",provider:"E.Leclerc",title:id,
    category:"épicerie",scope:"produit",stores:["leclerc"],
    channels:["store"],sourceUrl:"https://www.e.leclerc/",
    verifiedAt:"2026-10-12",reviewAfter:"2026-10-16",
    expiresAt:"2026-10-20",basePrice,savingPercent,...extra
  });
  const offers=[
    source("less-cheap",2,10),
    source("big-saver",6,50),
    source("multi",1.8,45,{minPurchaseQty:2}),
    source("unknown-cost",null,80),
    source("expired",5,99,{expiresAt:"2026-10-11"})
  ];
  const standard=selectDailyCatalogue({offers,store:"leclerc",
    channel:"store",now:at});
  assert.deepEqual(standard.highlights.map(x=>x.id),
    ["unknown-cost","big-saver","multi"]);
  assert.equal(standard.retailer.find(x=>x.id==="unknown-cost").upfrontCost,null);
  const multi=standard.retailer.find(x=>x.id==="multi");
  assert.equal(multi.minQuantity,2);
  assert.equal(multi.upfrontCost,3.6);
  assert.equal(multi.savingAmount,1.62);
  assert.equal(standard.retailer.find(x=>x.id==="big-saver").savingAmount,3);
  const euros=selectDailyCatalogue({offers,store:"leclerc",
    channel:"store",now:at,sort:"euros"});
  assert.deepEqual(euros.highlights.map(x=>x.id),
    ["big-saver","multi","less-cheap"],
    "Un rabais en euros connu précède une annonce en % sans prix");
  const cheap=selectDailyCatalogue({offers,store:"leclerc",
    channel:"store",now:at,sort:"budget"});
  assert.deepEqual(cheap.retailer.map(x=>x.id),
    ["less-cheap","multi","big-saver","unknown-cost"]);
  const constrained=selectDailyCatalogue({offers,store:"leclerc",
    channel:"store",now:at,maxSpend:3,sort:"percent",campaigns:[{
      id:"official",store:"leclerc",channels:["store"],
      title:"Publicité sans prix",claim:"Catalogue du jour",
      verifiedAt:"2026-10-12",expiresAt:"2026-10-17",
      sourceUrl:"https://nos-catalogues-promos-v2.e.leclerc/catalog/26G133G/0637",
      category:"alimentaire",advertisedMaxPercent:99
    }]});
  assert.deepEqual(constrained.retailer.map(x=>x.id),["less-cheap"]);
  assert.deepEqual(constrained.highlights.map(x=>x.id),["less-cheap"]);
  assert.equal(constrained.campaigns.length,1);
  assert.equal(constrained.highlights.some(x=>x.id==="official"),false,
    "Ne jamais classer une publicité non chiffrée comme gain réel");
});

test("sources du catalogue du jour : une vraie campagne prouvée, jamais une page générique",()=>{
  const campaign={id:"carrefour-bio-2eme-20261019",store:"carrefour",
    channels:["store","drive"],title:"Bio & bien plus",
    verifiedAt:"2026-10-12",startsAt:"2026-10-12",
    expiresAt:"2026-10-19",
    sourceUrl:"https://www.carrefour.fr/offres-du-moment"};
  const evidence='<html><body><article><img alt="Jusqu\'à -60% sur le 2eme sur le Bio">'+
    '<h2>Bio & bien plus</h2><p>Jusqu\'au 19 octobre 2026</p></article>'+
    '<p>'+("Offres du quotidien ".repeat(8))+'</p></body></html>';
  const today=new Date("2026-10-13T12:00:00Z");
  assert.equal(confirmPublicDailyCampaign(evidence,campaign,today),true);
  assert.equal(confirmPublicDailyCampaign(evidence,
    {...campaign,expiresAt:"2026-10-21"},today),false);
  assert.equal(confirmPublicDailyCampaign(evidence,
    {...campaign,sourceUrl:"https://www.carrefour.fr.evil.example/"},today),false);
  assert.equal(confirmPublicDailyCampaign(evidence,campaign,
    new Date("2026-10-20T12:00:00Z")),false);
  assert.equal(confirmPublicDailyCampaign(
    "<script>"+evidence+"</script>",campaign,today),false,
    "Les données internes masquées du site ne remplacent pas une annonce publique");
  const farApart="<html><body><p>Jusqu'à -60% sur le 2e</p>"+
    ("Autres promotions diverses ".repeat(55))+
    "<h2>Bio & bien plus</h2><p>Jusqu'au 19 octobre 2026</p></body></html>";
  assert.equal(confirmPublicDailyCampaign(farApart,campaign,today),false,
    "Le taux d'un autre prospectus ne confirme pas celui du Bio");
  const leclerc={id:"leclerc-quotidien-20261017",store:"leclerc",
    sourceUrl:"https://nos-catalogues-promos-v2.e.leclerc/catalog/26G133G/0637",
    verifiedAt:"2026-10-12",startsAt:"2026-10-06",
    expiresAt:"2026-10-17"};
  const leclercHtml="<html>Votre catalogue digital ! CATALOGUE: Nos promos du moment "+
    "Du 06/10/2026 au 17/10/2026. Rayons alimentaires et promotions en vigueur</html>";
  assert.equal(confirmPublicDailyCampaign(leclercHtml,leclerc,today),true);
  assert.equal(confirmPublicDailyCampaign(
    leclercHtml.replace("17/10/2026","18/10/2026"),leclerc,today),false);
});

test("source partiellement vérifiée : 9 bonnes offres restent visibles, la 10e seule est signalée",()=>{
  const at=new Date("2026-10-12T21:00:00Z");
  const snapshot=Array.from({length:10},(_,i)=>({
    id:"leclerc-product-"+i,externalId:"product-"+i,
    providerId:"leclerc",scope:"produit",
    verifiedAt:"2026-10-11",expiresAt:"2026-10-17"
  }));
  const source={leclerc:{status:"partial",
    checkedAt:"2026-10-12T20:00:00Z",
    confirmedExternalIds:snapshot.slice(0,9).map(x=>x.externalId),
    extractedCount:9,previousSnapshotCount:10,
    reason:"9/10 encore valides reconfirmées"}};
  const impacted=sourceRefreshImpact(snapshot,source,at);
  assert.equal(impacted.affectedCount,1);
  assert.equal(impacted.unaffectedCount,9);
  assert.equal(failedRefreshWarning(snapshot[8],source,at),null);
  assert.equal(failedRefreshWarning(snapshot[9],source,at)?.status,"partial");
  const unavailable={leclerc:{...source.leclerc,status:"unavailable"}};
  assert.equal(sourceRefreshImpact(snapshot,unavailable,at).affectedCount,10,
    "Une panne totale ne peut pas s'appuyer sur une ancienne liste partielle");
  const legacy={leclerc:{status:"partial",checkedAt:"2026-10-12T20:00:00Z"}};
  assert.equal(sourceRefreshImpact(snapshot,legacy,at).affectedCount,10,
    "Une ancienne source sans IDs reste traitée prudemment");

  // Integration: the public Shopmium sync may revalidate 45 of 46 offers.
  // Do not exclude the 45 successful records from the daily catalogue just
  // because the supplier is 'partial'. The unconfirmed one stays excluded.
  const checkAt=new Date("2026-10-13T19:00:00Z");
  const shopmium=Array.from({length:46},(_,index)=>({
    id:"shopmium-auto-food-"+index,externalId:"auto-food-"+index,
    title:"Produit alimentaire "+index,provider:"Shopmium",
    providerId:"shopmium",scope:"produit",category:"alimentaire",
    stores:["all"],channels:["store"],savingPercent:20,
    verifiedAt:"2026-10-13",reviewAfter:"2026-10-17",
    expiresAt:"2026-10-31",
    sourceUrl:"https://offers.shopmium.com/fr/n/kiri-6"
  }));
  const partialShopmium={shopmium:{
    status:"partial",checkedAt:"2026-10-13T12:56:31Z",
    confirmedExternalIds:shopmium.slice(0,45).map((offer)=>offer.externalId),
    extractedCount:45,previousSnapshotCount:46
  }};
  assert.equal(sourceRefreshImpact(shopmium,partialShopmium,checkAt).affectedCount,1);
  const loadedShopmium=shopmium.map((offer)=>{
    const warning=failedRefreshWarning(offer,partialShopmium,checkAt);
    return warning?{...offer,sourceSyncWarning:warning}:offer;
  });
  const daily=selectDailyCatalogue({
    offers:loadedShopmium,store:"carrefour",channel:"store",now:checkAt
  });
  assert.equal(daily.affordableCandidates,45);
  assert.equal(daily.highlights.length,3);
  assert.equal(daily.extra.some((offer)=>offer.id===shopmium[45].id),false);
  assert.equal(sourceRefreshImpact(shopmium,{
    shopmium:{...partialShopmium.shopmium,confirmedExternalIds:undefined}
  },checkAt).affectedCount,46);
});
