import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveShopmiumProductMatch,
  extractShopmiumOfferUrls,
  parsePercentTiers,
  parseReferenceNames,
  parseShopmiumDetailHtml,
  parseFlatPercent,
  parseShopmiumFixedRefund,
  parseShopmiumSavingCap,
  parseShopmiumUnlockRequirement,
  parseStores,
  parseValidityDates
} from "../src/adapters/shopmium.js";

test("extractShopmiumOfferUrls déduplique les fiches /fr/n",()=>{
  const html='<a href="/fr/n/a-chacun-son-daddy">A</a><a href="https://offers.shopmium.com/fr/n/a-chacun-son-daddy">B</a><a href="/fr/autre">X</a>';
  const urls=extractShopmiumOfferUrls(html);
  assert.deepEqual(urls,["https://offers.shopmium.com/fr/n/a-chacun-son-daddy"]);
});

test("parseValidityDates convertit les dates françaises",()=>{
  const dates=parseValidityDates("Valable entre le 01/10/2026 à partir de 08:00 et le 31/10/2026 jusqu'à 23:59");
  assert.deepEqual(dates,{startsAt:"2026-10-01",expiresAt:"2026-10-31"});
});

test("parsePercentTiers lit les paliers",()=>{
  const tiers=parsePercentTiers("1 article acheté = -20% sur le prix. 2 à 3 articles achetés = -25% sur le prix.");
  assert.deepEqual(tiers,[
    {minQty:1,maxQty:1,savingPercent:20},
    {minQty:2,maxQty:3,savingPercent:25}
  ]);
});

test("parseReferenceNames extrait les références et retire le prix",()=>{
  const html='<p>Référence(s) éligible(s) et prix généralement constaté(s) :</p><p>- Cassonade pure canne 750g (2,25€)</p><p>- Muscovado Brun 500g (2,49€)</p><p>Remboursement maximum calculé par article</p>';
  assert.deepEqual(parseReferenceNames(html),["Cassonade pure canne 750g","Muscovado Brun 500g"]);
});

test("deriveShopmiumProductMatch déduit Daddy et Fleury Michon",()=>{
  assert.equal(deriveShopmiumProductMatch("À chacun son Daddy",["Cassonade pure canne 750g"]).brands[0],"Daddy");
  assert.equal(deriveShopmiumProductMatch("Fleury Michon Plats Cuisinés",["Paella de la Mer"]).brands[0],"Fleury Michon");
});

test("parseShopmiumDetailHtml produit une offre prudente active",()=>{
  const html=`
    <title>Shopmium | À chacun son Daddy</title>
    <div>1 article acheté = -20%</div>
    <div>2 articles achetés = -25%</div>
    <p>Valable entre le 01/10/2026 à partir de 08:00 et le 31/10/2026 jusqu'à 23:59 dans toute enseigne vendante (Drive inclus).</p>
    <p>Référence(s) éligible(s) et prix généralement constaté(s) :</p>
    <p>- Cassonade pure canne 750g (2,25€)</p>
    <p>- Muscovado Brun 500g (2,49€)</p>
    <p>Remboursement maximum calculé par article</p>
    <p>Offre non cumulable avec toute autre promotion.</p>
  `;
  const offer=parseShopmiumDetailHtml(html,"https://offers.shopmium.com/fr/n/a-chacun-son-daddy",{verifiedAt:"2026-10-07"});
  assert.equal(offer.externalId,"auto-a-chacun-son-daddy");
  assert.equal(offer.savingPercent,25);
  assert.equal(offer.quantityTiers.length,2);
  assert.equal(offer.referenceNames.length,2);
  assert.equal(offer.stores[0],"all");
  assert.equal(offer.autoStack,false);
});


test("deriveShopmiumProductMatch ignore les mots grammaticaux français",()=>{
  assert.equal(
    deriveShopmiumProductMatch("À chacun son Daddy",["Cassonade pure canne 750g"]).brands[0],
    "Daddy"
  );
  assert.equal(
    deriveShopmiumProductMatch("Une pause gourmande Milka",["Mini Muffins Milka x6"]).brands[0],
    "Milka"
  );
});


test("deriveShopmiumProductMatch utilise les références pour confirmer la marque",()=>{
  assert.equal(
    deriveShopmiumProductMatch("RÉGILAIT YAOURT MAISON",["Régilait Yaourt Maison, sachet 175g"]).brands[0],
    "Régilait"
  );
  assert.equal(
    deriveShopmiumProductMatch("Gels Douche Sanex Derma Thérapie",[
      "SANEX DERMA THÉRAPIE ANTI-DESSÈCHEMENT 425ML",
      "SANEX DERMA THÉRAPIE ANTI-DÉMANGEAISON 425ML"
    ]).brands[0],
    "SANEX"
  );
});

test("deriveShopmiumProductMatch garde les marques courtes tout en majuscules",()=>{
  assert.equal(
    deriveShopmiumProductMatch("FRUIT SHOOT",["Pêche Abricot 6x20cl","Tropical 6x20cl"]).brands[0],
    "FRUIT SHOOT"
  );
  assert.equal(
    deriveShopmiumProductMatch("OH PURÉE!",["OH PUREE! AIL SACHET109g"]).brands[0],
    "OH PUREE"
  );
});

test("deriveShopmiumProductMatch trouve Fleury Michon en suffixe",()=>{
  assert.equal(
    deriveShopmiumProductMatch("Tranches Végé Fleury Michon",[
      "Tranches Végé Lentilles Corail 120g",
      "Tranches Végé Pois Chiches 120g"
    ]).brands[0],
    "Fleury Michon"
  );
});

test("Shopmium exclut Carrefour quand le contrat dit sauf Carrefour",()=>{
  const full="Valable entre le 01/10/2026 à partir de 08:00 et le 31/10/2026 jusqu'à 23:59 dans toute enseigne vendante (Drive inclus) sauf Carrefour, dans la limite des remboursements disponibles.";
  assert.deepEqual(parseStores(full),["leclerc"]);
  assert.deepEqual(parseStores(full.replace("sauf Carrefour","sauf Carrefour et Leclerc")),[]);
  assert.deepEqual(parseStores(full.replace("sauf Carrefour","sauf Auchan Supermarché et Casino")),["all"]);
});

test("Shopmium exige des magasins explicitement couverts en cas de liste exclusive",()=>{
  const dates="Valable entre le 01/10/2026 et le 31/10/2026 chez Carrefour, Carrefour Market, Leclerc, Intermarché et Coopérative U UNIQUEMENT, dans la limite des remboursements disponibles.";
  assert.deepEqual(parseStores(dates),["all"]);
  assert.deepEqual(parseStores(dates.replace("Carrefour, Carrefour Market, Leclerc, ","")),[]);
  assert.deepEqual(parseStores(dates.replace("Carrefour, Carrefour Market, Leclerc, ","Carrefour, ")),["carrefour"]);
  assert.deepEqual(parseStores("Valable entre le 01/10/2026 et le 31/10/2026 (magasins partenaires à consulter)"),[]);
});

test("les pourcentages marketing 100% bio ne deviennent pas des remboursements",()=>{
  assert.equal(parseFlatPercent("Une boisson 100% bio à savourer !"),null);
  assert.equal(parseFlatPercent("Offre 100% végétale. Conditions de l'offre : 1 article acheté = -25% sur le prix"),null);
  assert.equal(parseFlatPercent("Conditions de l'offre : remboursement de 100% du prix d’achat de l’article dans la limite de 1,00€"),100);
});

test("Shopmium capture le plafond monétaire et le déblocage, pas les quotas",()=>{
  assert.equal(parseShopmiumSavingCap("Remboursement de 100% du prix d’achat de l’article dans la limite de 1,00€"),1);
  assert.equal(parseShopmiumSavingCap("Valable dans la limite des remboursements disponibles."),null);
  assert.equal(parseShopmiumUnlockRequirement("Pour débloquer cette offre 100% remboursée, faites 2 demandes !")!==null,true);
  assert.equal(parseShopmiumUnlockRequirement("Offre classique 25% remboursés"),null);
});

test("un défi 100% plafonné reste une ODR conditionnelle, jamais un gain garanti",()=>{
  const html=`
    <title>Shopmium | Le Défi du Marché</title>
    <p>Pour débloquer cette offre, faites 2 demandes de remboursement.</p>
    <p>Conditions de l'offre</p>
    <p>Remboursement de 100% du prix d’achat de l’article dans la limite de 1,00€</p>
    <p>Valable entre le 20/04/2026 à partir de 08:00 et le 26/04/2026 jusqu'à 23:59 dans toute enseigne vendante (Drive inclus).</p>
    <p>Référence(s) éligible(s)</p>
    <p>Fruits et légumes</p>
    <p>Remboursement maximum calculé par article</p>
  `;
  const offer=parseShopmiumDetailHtml(html,"https://offers.shopmium.com/fr/n/le-defi-du-marche",{verifiedAt:"2026-04-22"});
  assert.equal(offer.savingPercent,100);
  assert.equal(offer.savingCapAmount,1);
  assert.equal(offer.requiresUnlock,true);
  assert.equal(offer.autoStack,false);
  assert.match(offer.conditions,/plafonné à 1,00 €/);
  assert.equal(offer.stores[0],"all");
});

test("l'import Shopmium bloque une offre de deux enseignes exclues",()=>{
  const html=`<title>Shopmium | Offre limitée</title>
    <p>Conditions de l'offre</p><p>30% remboursés</p>
    <p>Valable entre le 01/10/2026 et le 31/10/2026 dans toute enseigne vendante sauf Carrefour et Leclerc, dans la limite des remboursements disponibles.</p>`;
  assert.equal(parseShopmiumDetailHtml(html,"https://offers.shopmium.com/fr/n/offre-limitee",{verifiedAt:"2026-10-09"}),null);
});

test("remboursement fixe 1,50 € sur le miel : pas de faux pourcentage",()=>{
  const html=`
    <title>Shopmium | Miel l'Apiculteur® - Format 500g</title>
    <p>1,50€ remboursé sur 1 article</p>
    <p>Conditions de l'offre</p>
    <p>Offre “1,50€ remboursé sur 1 article” : remboursement fixe de 1,50€ pour toute demande de remboursement.</p>
    <p>Valable entre le 29/07/2026 à partir de 08:00 et le 04/11/2026 jusqu'à 23:59 dans toute enseigne vendante (Drive inclus), dans la limite des remboursements disponibles.</p>
    <p>Référence(s) éligible(s) et prix généralement constaté(s)</p>
    <p>- Miel de Fleurs Liquide Pot verre 500G (7,29€)</p>
    <p>Remboursement maximum calculé par article</p>`;
  const offer=parseShopmiumDetailHtml(html,"https://offers.shopmium.com/fr/n/miel-l-apiculteur-format-500g",{verifiedAt:"2026-10-09"});
  assert.equal(offer.savingPercent,undefined);
  assert.equal(offer.savingAmount,1.5);
  assert.equal(offer.savingAmountMode,"per-offer");
  assert.equal(offer.expiresAt,"2026-11-04");
  assert.deepEqual(offer.stores,["all"]);
  assert.equal(parseShopmiumFixedRefund("Un pot vaut 1,50€ seulement"),null);
  assert.equal(parseShopmiumFixedRefund("Conditions de l'offre : remboursement de 100% dans la limite de 1,00€"),null);
});

test("une offre fixe réservée à Carrefour n'est pas montrée chez Leclerc",()=>{
  const html=`
    <title>Shopmium | Coloration Barbe et Moustache Just For Men</title>
    <p>Conditions de l'offre</p>
    <p>Remboursement fixe de 2,00€ pour toute demande de remboursement.</p>
    <p>Valable entre le 02/06/2026 à partir de 08:00 et le 22/11/2026 jusqu'à 23:59 chez Carrefour (Drive inclus), dans la limite des remboursements disponibles.</p>`;
  const offer=parseShopmiumDetailHtml(html,"https://offers.shopmium.com/fr/n/coloration-barbe-et-moustache-just-for-men",{verifiedAt:"2026-10-09"});
  assert.equal(offer.savingAmount,2);
  assert.deepEqual(offer.stores,["carrefour"]);
});

test("montant fixe en pharmacie uniquement : aucun magasin alimentaire éligible",()=>{
  const html=`
    <title>Shopmium | Sommeil</title>
    <p>Conditions de l'offre</p><p>Remboursement fixe de 4,00€ pour toute demande de remboursement.</p>
    <p>Valable entre le 01/10/2026 et le 31/10/2026 en pharmacie UNIQUEMENT, dans la limite des remboursements disponibles.</p>`;
  assert.equal(parseShopmiumDetailHtml(html,"https://offers.shopmium.com/fr/n/sommeil",{verifiedAt:"2026-10-09"}),null);
});
