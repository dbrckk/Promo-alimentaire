import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLaBelleAdresseOffer,
  deriveLaBelleAdresseProductMatch,
  parseLaBelleAdresseHtml,
  parseRefundPercent
} from "../src/adapters/la-belle-adresse.js";

test("parseRefundPercent ne garde que les pourcentages remboursés",()=>{
  assert.equal(parseRefundPercent("40 % remboursé"),40);
  assert.equal(parseRefundPercent("1,00€"),null);
  assert.equal(parseRefundPercent("40 %"),null);
});

test("parseLaBelleAdresseHtml extrait et déduplique les cartes remboursement",()=>{
  const html=`
    <article><h3>Le Chat Excellence Maxi Discs</h3><h4>40 % remboursé</h4><button>Sélectionner</button></article>
    <article><h3>X.TRA Express</h3><h4>40 % remboursé</h4><button>Sélectionner</button></article>
    <article><h3>Le Chat Excellence Maxi Discs</h3><h4>40 % remboursé</h4></article>
    <article><h3>RUBSON RENEW</h3><h4>3,00€</h4><button>Impression</button></article>
  `;
  const offers=parseLaBelleAdresseHtml(html,{verifiedAt:"2026-10-07"});
  assert.equal(offers.length,2);
  assert.equal(offers[0].title,"Le Chat Excellence Maxi Discs");
  assert.equal(offers[1].title,"X.TRA Express");
  assert.equal(offers[0].reviewAfter,"2026-10-14");
});

test("deriveLaBelleAdresseProductMatch reconnait les marques Henkel",()=>{
  const chat=deriveLaBelleAdresseProductMatch("Le Chat Excellence Maxi Discs");
  assert.deepEqual(chat.brands,["Le Chat"]);
  assert.ok(chat.any.includes("Excellence"));

  const xtra=deriveLaBelleAdresseProductMatch("X.TRA Evasion Triocaps");
  assert.ok(xtra.brands.includes("X.TRA"));
  assert.ok(xtra.any.includes("Evasion"));

  const mir=deriveLaBelleAdresseProductMatch("Mir Lessive Fraîcheur");
  assert.deepEqual(mir.brands,["Mir"]);
  assert.ok(mir.any.includes("Fraicheur"));
});

test("buildLaBelleAdresseOffer reste candidat non autoStack",()=>{
  const offer=buildLaBelleAdresseOffer({
    title:"Mir Vaisselle (675ml)",percent:40,verifiedAt:"2026-10-07"
  });
  assert.equal(offer.savingPercent,40);
  assert.equal(offer.autoStack,false);
  assert.equal(offer.stackingConfidence,"restricted");
  assert.equal(offer.productMatch.brands[0],"Mir");
});
