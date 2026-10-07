import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveProductMatch,
  extractCouponNetworkDetailUrls,
  htmlToTextLines,
  parseCouponNetworkDetailHtml,
  parseCouponNetworkHtml,
  parseRefundAmount
} from "../src/adapters/coupon-network.js";

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


test("extractCouponNetworkDetailUrls déduplique les fiches publiques",()=>{
  const html='<a href="/autres-enseignes-cashback-coupons/president-coupon/108489">A</a>'
    +'<a href="https://www.couponnetwork.fr/autres-enseignes-cashback-coupons/president-coupon/108489">B</a>'
    +'<a href="/autres-enseignes-cashback-coupons/bonduelle-coupon/108567">C</a>';
  const urls=extractCouponNetworkDetailUrls(html);
  assert.equal(urls.length,2);
  assert.ok(urls[0].startsWith("https://www.couponnetwork.fr/"));
});

test("parseCouponNetworkDetailHtml lit une fiche server-rendered",()=>{
  const html=`
    <title>Bons de réduction gratuits Président - Poche 30cl à sélectionner – Coupon Network</title>
    <h1>Président - Poche 30cl</h1>
    <div>0,30&nbsp;€ REMBOURSÉ</div>
    <h2>Sur l'achat d'une poche 30cl Président fraîche et épaisse 25% MG.</h2>
  `;
  const offer=parseCouponNetworkDetailHtml(
    html,
    "https://www.couponnetwork.fr/autres-enseignes-cashback-coupons/president-coupon/108489",
    {verifiedAt:"2026-10-07"}
  );
  assert.equal(offer.externalId,"detail-108489");
  assert.equal(offer.savingAmount,0.3);
  assert.equal(offer.title,"Président - Poche 30cl");
  assert.equal(offer.sourceUrl.endsWith("/108489"),true);
});
