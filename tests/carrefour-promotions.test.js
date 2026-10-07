import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePageText,
  verifyCarrefourPromotionPage
} from "../src/adapters/carrefour-promotions.js";

const offer={
  title:"−30% · Pâtes Fusilli Panzani",
  savingPercent:30,
  sourcePromoPrice:1.11,
  sourceRegularPrice:1.59,
  eans:["3038359913242"],
  sourceUrl:"https://www.carrefour.fr/p/pates-fusilli-panzani-3038359913242",
  productMatch:{brands:["Panzani"],all:["fusilli"],any:["500g"]}
};

test("vérifie une promo Carrefour exacte",()=>{
  const html=`
    <h1>Pâtes Fusilli Fermes et Généreuses PANZANI</h1>
    <span>le paquet de 500g</span>
    <div>1 ,11 € au lieu de 1,59 €</div>
    <div>PROMO : 30%</div>
  `;
  const result=verifyCarrefourPromotionPage(html,offer);
  assert.equal(result.ok,true);
});

test("refuse un taux voisin",()=>{
  const html=`
    <h1>Pâtes Fusilli Fermes et Généreuses PANZANI</h1>
    <span>le paquet de 500g</span>
    <div>1,11 € au lieu de 1,59 €</div>
    <div>PROMO : 20%</div>
  `;
  const result=verifyCarrefourPromotionPage(html,offer);
  assert.equal(result.ok,false);
  assert.ok(result.reasons.includes("taux promo absent"));
});

test("refuse si le prix promo attendu disparaît",()=>{
  const html=`
    <h1>Pâtes Fusilli Fermes et Généreuses PANZANI</h1>
    <span>le paquet de 500g</span>
    <div>1,25 € au lieu de 1,59 €</div>
    <div>PROMO : 30%</div>
  `;
  const result=verifyCarrefourPromotionPage(html,offer);
  assert.equal(result.ok,false);
  assert.ok(result.reasons.includes("prix promo absent"));
});

test("refuse une URL ne contenant pas l'EAN attendu",()=>{
  const html=`
    <h1>Pâtes Fusilli Fermes et Généreuses PANZANI</h1>
    <span>le paquet de 500g</span>
    <div>1,11 € au lieu de 1,59 €</div>
    <div>PROMO : 30%</div>
  `;
  const result=verifyCarrefourPromotionPage(html,offer,{
    sourceUrl:"https://www.carrefour.fr/p/autre-0000000000000"
  });
  assert.equal(result.ok,false);
  assert.ok(result.reasons.includes("EAN absent de l'URL produit Carrefour"));
});

test("normalizePageText nettoie les balises",()=>{
  assert.equal(
    normalizePageText("<p>PROMO&nbsp;: <b>30%</b></p>"),
    "PROMO : 30%"
  );
});
