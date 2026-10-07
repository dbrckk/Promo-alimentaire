import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOpenFoodFactsSearchTerms,
  scoreOpenFoodFactsCandidate,
  selectUniqueEanCandidate
} from "../src/ean-resolver.js";

const offer={
  title:"−34% · Nescafé Espresso Concentrate",
  productMatch:{
    brands:["Nescafé"],
    all:["espresso"],
    any:["concentrate"]
  }
};

test("construit une recherche courte à partir des règles produit",()=>{
  assert.equal(
    buildOpenFoodFactsSearchTerms(offer),
    "Nescafé espresso concentrate"
  );
});

test("un candidat marque + nom exact est accepté",()=>{
  const result=scoreOpenFoodFactsCandidate(offer,{
    code:"3017624010701",
    product_name:"Espresso Concentrate",
    brands:"Nescafé",
    quantity:"500 ml"
  });
  assert.equal(result.accepted,true);
  assert.ok(result.score>=80);
});

test("une autre marque est rejetée même avec un nom proche",()=>{
  const result=scoreOpenFoodFactsCandidate(offer,{
    code:"3017624010701",
    product_name:"Espresso Concentrate",
    brands:"Autre marque"
  });
  assert.equal(result.accepted,false);
  assert.ok(result.reasons.includes("brand-mismatch"));
});

test("deux candidats presque équivalents restent ambigus",()=>{
  const ambiguousOffer={
    title:"Biscottes Heudebert",
    productMatch:{brands:["Heudebert"],any:["biscottes"]}
  };
  const result=selectUniqueEanCandidate(ambiguousOffer,[
    {code:"7622210416629",product_name:"La Biscotte",brands:"Heudebert"},
    {code:"7622210691286",product_name:"Biscottes bio",brands:"Heudebert"}
  ]);
  assert.equal(result.status,"ambiguous");
  assert.equal(result.candidate,null);
});

test("un seul candidat nettement supérieur peut être retenu",()=>{
  const result=selectUniqueEanCandidate(offer,[
    {code:"3017624010701",product_name:"Espresso Concentrate",brands:"Nescafé"},
    {code:"7622210416629",product_name:"Espresso",brands:"Autre"}
  ]);
  assert.equal(result.status,"unique");
  assert.equal(result.candidate.code,"3017624010701");
});
