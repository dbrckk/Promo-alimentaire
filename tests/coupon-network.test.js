import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanOfferTitle,
  deriveProductMatch,
  extractCouponNetworkDetailUrls,
  inferMinPurchaseQty,
  htmlToTextLines,
  parseCouponNetworkDetailHtml,
  parseCouponNetworkHtml,
  parseRefundAmount,
  assessCouponNetworkSnapshot
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
    +'<a href="/carrefour-cashback-coupons/president-coupon/108489">B2</a>'
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


test("inferMinPurchaseQty détecte les achats multiples",()=>{
  assert.equal(inferMinPurchaseQty("Sur l'achat de 2 paquets de café moulu Grand'Mère."),2);
  assert.equal(inferMinPurchaseQty("Sur l'achat de 3 produits au choix."),3);
  assert.equal(inferMinPurchaseQty("Sur l'achat d'un produit Alpro."),1);
});

test("parseCouponNetworkHtml conserve un remboursement fixe par offre",()=>{
  const html=`
    <a>1,20€ REMBOURSÉ</a>
    <h3>Grand'Mère - Café moulu</h3>
    <p>Sur l'achat de 2 paquets de café moulu Grand'Mère familial.</p>
  `;
  const [offer]=parseCouponNetworkHtml(html,{verifiedAt:"2026-10-07"});
  assert.equal(offer.minPurchaseQty,2);
  assert.equal(offer.savingAmountMode,"per-offer");
});


test("cleanOfferTitle retire le badge de remboursement collé au titre",()=>{
  assert.equal(
    cleanOfferTitle("STARBUCKS® x10 0,50 € REMBOURSÉ"),
    "STARBUCKS® x10"
  );
  assert.equal(
    cleanOfferTitle("Les Dieux - Global Gamme 0,40 € REMBOURSÉS"),
    "Les Dieux - Global Gamme"
  );
});


test("deriveProductMatch utilise la description pour un titre générique",()=>{
  const match=deriveProductMatch(
    "Les Dieux - Global Gamme",
    "Sur l'achat de 2 boîtes de sardines Les Dieux au choix dans la gamme."
  );
  assert.equal(match.brands[0],"Les Dieux");
  assert.ok(match.all.includes("sardines"));
});

test("deriveProductMatch déduplique les termes répétitifs",()=>{
  const match=deriveProductMatch(
    "Sous le Pommier - Pur jus de Pomme Nature ou Pomme Poire 1L"
  );
  assert.equal(new Set(match.all.map((x)=>x.toLowerCase())).size,match.all.length);
});


test("deriveProductMatch ignore les quantités numériques seules",()=>{
  const match=deriveProductMatch(
    "Les Dieux - Global Gamme",
    "Sur l'achat de 2 boîtes de sardines Les Dieux au choix dans la gamme."
  );
  assert.deepEqual(match.all,["sardines"]);
});

test("une source à zéro offre n'efface jamais l'ancien snapshot",()=>{
  assert.deepEqual(assessCouponNetworkSnapshot([],{
    previousCount:118,minimum:20
  }),{publish:false,reason:"too-few-offers",count:0});
});

test("une chute brutale du catalogue est bloquée même au-dessus du minimum",()=>{
  const candidates=Array.from({length:25},(_,i)=>({
    externalId:"offer-"+i,autoStack:false,eans:[]
  }));
  assert.equal(assessCouponNetworkSnapshot(candidates,{
    previousCount:118,minimum:20
  }).reason,"suspiciously-large-drop");
  assert.equal(assessCouponNetworkSnapshot(candidates,{
    previousCount:30,minimum:20
  }).publish,true);
});

test("le remplacement refuse les doublons et économies non vérifiées",()=>{
  const offers=Array.from({length:20},(_,i)=>({externalId:"offer-"+i}));
  assert.equal(assessCouponNetworkSnapshot(offers,{
    previousCount:20
  }).publish,true);
  assert.equal(assessCouponNetworkSnapshot(
    [...offers.slice(0,-1),offers[0]],{previousCount:20}
  ).reason,"duplicate-or-missing-ids");
  assert.equal(assessCouponNetworkSnapshot(
    [...offers.slice(0,-1),{...offers[19],autoStack:true}],{previousCount:20}
  ).reason,"unexpected-automatic-eligibility");
});
