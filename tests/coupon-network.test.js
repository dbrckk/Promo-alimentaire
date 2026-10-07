import test from "node:test";
import assert from "node:assert/strict";
import { deriveProductMatch, htmlToTextLines, parseCouponNetworkHtml, parseRefundAmount } from "../src/adapters/coupon-network.js";

const fixture=`
<section>
  <a>0,20&euro; REMBOURSÉ</a>
  <button>Sélectionner</button>
  <div>Sélectionné</div>
  <h3>Bonduelle - Carottes râpées au Citron de Sicile</h3>
  <p>Sur l\'achat d\'une barquette de carottes râpées Bonduelle au citron de Sicile.</p>
  <div>J\'augmente</div><div>ma réduction</div><div>0 €</div>
  <a>1€ REMBOURSÉ</a>
  <button>Sélectionner</button>
  <h3>Lactel - Vita \'Vie 6x1L</h3>
  <p>Sur l\'achat d\'un pack 6x1L de lait Lactel Vita\'Vie.</p>
  <a>BONUS QUIZ 1 question Validé + 0,10 €</a>
</section>`;

test("htmlToTextLines nettoie les balises et entités",()=>{
  const lines=htmlToTextLines("<p>0,50&euro; REMBOURSÉ</p><h3>Alpro - brassés végétaux</h3>");
  assert.deepEqual(lines,["0,50€ REMBOURSÉ","Alpro - brassés végétaux"]);
});

test("parseRefundAmount accepte virgule et montant entier",()=>{
  assert.equal(parseRefundAmount("0,50€ REMBOURSÉ"),0.5);
  assert.equal(parseRefundAmount("1€ REMBOURSÉ"),1);
  assert.equal(parseRefundAmount("BONUS QUIZ + 0,10 €"),null);
});

test("parseCouponNetworkHtml extrait des candidats prudents",()=>{
  const offers=parseCouponNetworkHtml(fixture,{verifiedAt:"2026-10-07"});
  assert.equal(offers.length,2);
  assert.equal(offers[0].savingAmount,0.2);
  assert.equal(offers[0].title,"Bonduelle - Carottes râpées au Citron de Sicile");
  assert.equal(offers[0].reviewAfter,"2026-10-14");
  assert.equal(offers[0].autoStack,false);
  assert.equal(offers[1].savingAmount,1);
});

test("deriveProductMatch exige la marque et des termes distinctifs",()=>{
  assert.deepEqual(deriveProductMatch("Président - Poche 30cl"),{brands:["Président"],all:["Poche","30cl"],minScore:75});
  const starbucks=deriveProductMatch("STARBUCKS® x10");
  assert.equal(starbucks.brands[0],"STARBUCKS");
  assert.deepEqual(starbucks.all,["x10"]);
});
