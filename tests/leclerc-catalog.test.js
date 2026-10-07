import test from "node:test";
import assert from "node:assert/strict";
import { verifyLeclercCatalogOffer } from "../src/adapters/leclerc-catalog.js";

test("vérifie un Ticket E.Leclerc produit",()=>{
  const html="<div>20 % Ticket E.Leclerc avec la Carte TABLES DU MONDE 10 MINI NEMS POULET ET PORC</div>";
  const result=verifyLeclercCatalogOffer(html,{
    savingPercent:20,mechanism:"retailer_loyalty",
    productMatch:{brands:["Tables du Monde"],any:["mini nems","poulet"]}
  });
  assert.equal(result.ok,true);
});

test("vérifie 2+1 offert",()=>{
  const html="<div>2+1 OFFERT HEUDEBERT BISCOTTES 1,67 € l'unité</div>";
  const result=verifyLeclercCatalogOffer(html,{
    promoFormula:{type:"buy_x_get_y_free",buy:2,free:1},
    productMatch:{brands:["Heudebert"],any:["biscottes"]}
  });
  assert.equal(result.ok,true);
});

test("vérifie −68% sur le 2e",()=>{
  const html="<div>− 68 % SUR LE 2e PRODUIT ACHETÉ GULLÓN BISCUITS PETIT-DÉJEUNER</div>";
  const result=verifyLeclercCatalogOffer(html,{
    promoFormula:{type:"nth_percent",nth:2,cycle:2,percent:68},
    productMatch:{brands:["Gullón"],any:["biscuits"]}
  });
  assert.equal(result.ok,true);
});

test("refuse un taux voisin si le taux attendu manque",()=>{
  const html="<div>GULLÓN BISCUITS 60 % sur le 2e produit</div>";
  const result=verifyLeclercCatalogOffer(html,{
    promoFormula:{type:"nth_percent",nth:2,cycle:2,percent:68},
    productMatch:{brands:["Gullón"],any:["biscuits"]}
  });
  assert.equal(result.ok,false);
  assert.ok(result.reasons.includes("remise sur le 2e absente"));
});
