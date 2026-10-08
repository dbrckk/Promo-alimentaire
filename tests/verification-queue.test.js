import test from "node:test";
import assert from "node:assert/strict";
import { buildVerificationQueue } from "../src/verification-queue.js";

const product=(code,name)=>({code,name,brands:"Test"});

function pendingLine(code,name,offer,saving,already=0,exact=false){
  return {
    code,product:product(code,name),quantity:1,
    missingPrice:false,guaranteedSaving:already,
    bestSavingCandidate:{
      offer,match:{matched:true,exact,score:exact?100:65},saving
    },
    appliedOffers:[]
  };
}

test("une offre à vérifier affiche les obstacles et le gain additionnel seulement",()=>{
  const offer={
    id:"exact",provider:"E.Leclerc",title:"Ticket 30 %",
    scope:"produit",eans:["3017624010701"],requiresStoreVerification:true,
    savingPercent:30,autoStack:false
  };
  const queue=buildVerificationQueue({
    store:"leclerc",channel:"store",locationReliable:false,
    lines:[pendingLine("3017624010701","Produit A",offer,3,1,true)]
  });
  assert.equal(queue.totalCount,1);
  assert.equal(queue.items[0].additionalSaving,2);
  assert.equal(queue.items[0].exact,true);
  assert.ok(queue.items[0].blockers.some((b)=>/magasin|point de vente/i.test(b)));
});

test("les gains déjà appliqués ou les prix manquants ne deviennent pas des tâches",()=>{
  const offer={id:"x",scope:"produit",eans:["3017624010701"]};
  const noPrice={...pendingLine("3017624010701","X",offer,3),missingPrice:true};
  const queue=buildVerificationQueue({
    store:"carrefour",lines:[
      pendingLine("3017624010701","X",offer,2,2,true),
      noPrice
    ]
  });
  assert.equal(queue.totalCount,0);
});

test("l'ordre privilégie le gain supplémentaire et non la seule confiance",()=>{
  const exact={id:"exact",scope:"produit",eans:["3017624010701"]};
  const heuristic={
    id:"heuristic",scope:"produit",productMatch:{brands:["Test"]},autoStack:false
  };
  const queue=buildVerificationQueue({
    store:"carrefour",lines:[
      pendingLine("3017624010701","A",exact,2,0,true),
      pendingLine("4006381333931","B",heuristic,5,0,false)
    ]
  });
  assert.equal(queue.items[0].name,"B");
  assert.equal(queue.topSingleAdditionalSaving,5);
  assert.ok(queue.items[0].blockers.some((b)=>/référence produit/i.test(b)));
});

test("la liste est bornée sans additionner des offres potentiellement incompatibles",()=>{
  const offer={id:"x",scope:"produit",eans:["3017624010701"]};
  const queue=buildVerificationQueue({
    store:"carrefour",
    lines:Array.from({length:10},(_,i)=>
      pendingLine("3017624010701",String(i),offer,i+1)
    )
  },{limit:3});
  assert.equal(queue.items.length,3);
  assert.equal(queue.totalCount,10);
  assert.equal(queue.topSingleAdditionalSaving,10);
});


test("une offre déjà appliquée ne masque pas une autre offre à vérifier",()=>{
  const applied={id:"applied",scope:"produit",eans:["3017624010701"],autoStack:true};
  const pending={id:"pending",scope:"produit",eans:["3017624010701"],autoStack:false};
  const line=pendingLine("3017624010701","Produit",applied,5,2,true);
  line.appliedOffers=[applied];
  line.savingCandidates=[
    {offer:applied,saving:5,match:{exact:true}},
    {offer:pending,saving:4,match:{exact:true}}
  ];
  const queue=buildVerificationQueue({store:"carrefour",lines:[line]});
  assert.equal(queue.items.length,1);
  assert.equal(queue.items[0].offerId,"pending");
  assert.equal(queue.items[0].additionalSaving,2);
});

test("aucune vérification n'est demandée si toutes les offres sont déjà appliquées",()=>{
  const applied={id:"applied",scope:"produit",eans:["3017624010701"]};
  const line=pendingLine("3017624010701","Produit",applied,5,1,true);
  line.appliedOffers=[applied];
  line.savingCandidates=[{offer:applied,saving:5,match:{exact:true}}];
  assert.equal(buildVerificationQueue({store:"carrefour",lines:[line]}).totalCount,0);
});
