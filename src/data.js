export const DATASET_DATE = "2026-10-06";

export const providers = [
  {
    id:"shopmium", name:"Shopmium", kinds:["ODR","cashback ticket"], priority:"essentiel",
    stores:["carrefour","leclerc"], url:"https://www.shopmium.com/fr/",
    note:"Remboursements partiels ou jusqu'à 100 % sur des références précises après preuve d'achat."
  },
  {
    id:"coupon-network", name:"Coupon Network", kinds:["ODR","coupons","challenges"], priority:"essentiel",
    stores:["carrefour","leclerc"], url:"https://www.couponnetwork.fr/",
    note:"Offres valables en magasin, Drive et livraison ; ticket ou carte de fidélité selon l'enseigne."
  },
  {
    id:"fidme-courses", name:"Fidme Courses", kinds:["ODR","bons d'achat","catalogues"], priority:"essentiel",
    stores:["carrefour","leclerc"], url:"https://www.fidme.com/nos-services/app-fidme-course/",
    note:"ODR, bons d'achat remisés et préparation de courses dans une même application."
  },
  {
    id:"fidmarques", name:"FidMarques", kinds:["fidélité marque","remboursements"], priority:"fort",
    stores:["carrefour","leclerc"], url:"https://fidmarques.com/",
    note:"Points par marque à partir des tickets, échangeables contre des produits remboursés."
  },
  {
    id:"joko", name:"Joko", kinds:["cashback","bons d'achat","codes"], priority:"fort",
    stores:["carrefour","leclerc"], url:"https://www.joko.com/",
    note:"Cashback en ligne, offres carte bancaire et bons d'achat selon les partenaires."
  },
  {
    id:"ebuyclub", name:"eBuyClub", kinds:["cashback","bons d'achat","ticket"], priority:"essentiel",
    stores:["carrefour","leclerc"], url:"https://www.ebuyclub.com/",
    note:"Cashback en ligne, bons d'achat remisés et cashback connecté/ticket."
  },
  {
    id:"poulpeo", name:"Poulpeo", kinds:["cashback","bons d'achat","codes"], priority:"fort",
    stores:["carrefour"], url:"https://www.poulpeo.com/",
    note:"Cashback et bons d'achat ; Carrefour propose notamment des bons remisés."
  },
  {
    id:"widilo", name:"Widilo", kinds:["cashback","bons d'achat","codes"], priority:"fort",
    stores:["carrefour"], url:"https://www.widilo.fr/",
    note:"Cashback web et bons d'achat ; conditions de cumul à vérifier pour chaque marchand."
  },
  {
    id:"igraal", name:"iGraal", kinds:["cashback","codes"], priority:"fort",
    stores:["carrefour","leclerc"], url:"https://fr.igraal.com/",
    note:"Cashback et codes promo ; utile surtout pour les achats en ligne et partenaires éligibles."
  },
  {
    id:"wanteeed", name:"Wanteeed", kinds:["codes","cashback","comparateur"], priority:"complément",
    stores:["carrefour"], url:"https://wanteeed.com/fr/",
    note:"Teste des codes promo et propose du cashback chez des marchands partenaires."
  },
  {
    id:"bonial", name:"Bonial", kinds:["catalogues","promos magasin"], priority:"essentiel",
    stores:["carrefour","leclerc"], url:"https://www.bonial.fr/",
    note:"Catalogues et promotions locales de la grande distribution, dont Carrefour et E.Leclerc."
  },
  {
    id:"belle-adresse", name:"La Belle Adresse", kinds:["ODR","bons de réduction"], priority:"fort",
    stores:["carrefour","leclerc"], url:"https://www.labelleadresse.com/economies",
    note:"Coupons et remboursements sur des marques Henkel ; restrictions de cumul fréquentes."
  },
  {
    id:"dealabs", name:"Dealabs", kinds:["bons plans","communauté"], priority:"complément",
    stores:["carrefour","leclerc"], url:"https://www.dealabs.com/",
    note:"Bons plans communautaires utiles pour détecter des promotions ponctuelles ou locales."
  },
  {
    id:"carrefour", name:"Club Carrefour / PASS", kinds:["fidélité enseigne","promos"], priority:"essentiel",
    stores:["carrefour"], url:"https://www.carrefour.fr/services/carte-pass",
    note:"Avantages fidélité et promotions propres à Carrefour ; à intégrer comme couche magasin."
  },
  {
    id:"leclerc", name:"E.Leclerc", kinds:["fidélité enseigne","promos"], priority:"essentiel",
    stores:["leclerc"], url:"https://www.e.leclerc/",
    note:"Prix et avantages Carte E.Leclerc dépendent du magasin ; source directe à intégrer."
  },
  {
    id:"envie-plus", name:"Envie de Plus", kinds:["ODR","bons de réduction"], priority:"fort",
    stores:["carrefour","leclerc"], url:"https://www.enviedeplus.com/remboursement",
    note:"Remboursements et coupons sur des marques P&G ; les offres sont souvent non cumulables avec les promotions."
  },
  {
    id:"ma-vie-couleurs", name:"Ma vie en couleurs", kinds:["ODR","bons de réduction"], priority:"fort",
    stores:["carrefour","leclerc"], url:"https://www.mavieencouleurs.fr/",
    note:"Réductions multi-marques utilisables en magasin, Drive ou livraison selon les conditions de l'offre."
  },
  {
    id:"anti-crise", name:"Anti-Crise", kinds:["optimisations","ODR","catalogues"], priority:"fort",
    stores:["carrefour","leclerc"], url:"https://anti-crise.fr/",
    note:"Communauté spécialisée dans les optimisations de courses, promotions fortes, ODR et produits 100 % remboursés."
  },
  {
    id:"ma-reduc", name:"Ma Reduc", kinds:["codes promo","bons plans"], priority:"complément",
    stores:["carrefour","leclerc"], url:"https://www.ma-reduc.com/",
    note:"Codes promo et offres marchands ; utile pour compléter les achats en ligne et Drive."
  },
  {
    id:"too-good-to-go", name:"Too Good To Go", kinds:["anti-gaspi","paniers"], priority:"complément",
    stores:["carrefour","leclerc"], url:"https://www.toogoodtogo.com/fr",
    note:"Paniers d'invendus à prix réduit ; particulièrement pertinent chez Carrefour et autres magasins partenaires."
  },
  {
    id:"phenix", name:"Phenix", kinds:["anti-gaspi","paniers"], priority:"complément",
    stores:["carrefour","leclerc"], url:"https://www.wearephenix.com/application-anti-gaspi/",
    note:"Paniers d'invendus à prix réduit proposés par supermarchés et commerces partenaires."
  }
];

export const offers = [
  {
    id:"fidme-carrefour-giftcard-4", provider:"Fidme Courses", providerId:"fidme-courses",
    title:"Bon d'achat Carrefour remisé", type:"bon d'achat", category:"panier",
    stores:["carrefour"], savingPercent:4, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", sourceUrl:"https://www.fidme.com/nos-services/app-fidme-course/",
    scope:"panier", stacking:"généralement cumulable avec promos magasin, vérifier les exclusions",
    conditions:"Exemple officiel Fidme : bon Carrefour de 100 € acheté 96 €. Conditions exactes à contrôler avant achat."
  },
  {
    id:"widilo-carrefour-giftcard-4", provider:"Widilo", providerId:"widilo",
    title:"Carte cadeau Carrefour", type:"bon d'achat", category:"panier",
    stores:["carrefour"], savingPercent:4, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", sourceUrl:"https://www.widilo.fr/bon-d-achat/carrefour",
    scope:"panier", stacking:"paiement par bon ; cumul selon conditions Carrefour",
    conditions:"Widilo affiche 4 % de cashback sur la carte cadeau Carrefour. Validité et canaux d'utilisation à vérifier sur la fiche."
  },
  {
    id:"ebuyclub-carrefour-giftcard-36", provider:"eBuyClub", providerId:"ebuyclub",
    title:"Carte cadeau Carrefour", type:"bon d'achat", category:"panier",
    stores:["carrefour"], savingPercent:3.6, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", sourceUrl:"https://www.ebuyclub.com/selection-bons-d-achat/carrefour-10310",
    scope:"panier", stacking:"paiement par bon ; vérifier exclusions",
    conditions:"eBuyClub affiche 3,6 % remboursés immédiatement sur la carte cadeau Carrefour."
  },
  {
    id:"poulpeo-carrefour-giftcard-36", provider:"Poulpeo", providerId:"poulpeo",
    title:"Bon d'achat Carrefour", type:"bon d'achat", category:"panier",
    stores:["carrefour"], savingPercent:3.6, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", sourceUrl:"https://www.poulpeo.com/cashback-bon-d-achat.html",
    scope:"panier", stacking:"paiement par bon ; vérifier exclusions",
    conditions:"Poulpeo affiche 3,6 % de cashback immédiat sur le bon d'achat Carrefour en magasin."
  },
  {
    id:"ebuyclub-carrefour-connected-005", provider:"eBuyClub", providerId:"ebuyclub",
    title:"Cashback connecté Carrefour", type:"cashback carte", category:"panier",
    stores:["carrefour"], savingPercent:0.05, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", sourceUrl:"https://www.ebuyclub.com/cashback-connecte",
    scope:"panier", stacking:"à vérifier selon transaction et autres activations",
    conditions:"Taux affiché au moment de la vérification : 0,05 % en magasin."
  },
  {
    id:"ebuyclub-leclerc-connected-005", provider:"eBuyClub", providerId:"ebuyclub",
    title:"Cashback connecté E.Leclerc", type:"cashback carte", category:"panier",
    stores:["leclerc"], savingPercent:0.05, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", sourceUrl:"https://www.ebuyclub.com/cashback-connecte",
    scope:"panier", stacking:"à vérifier selon transaction et autres activations",
    conditions:"Taux affiché au moment de la vérification : 0,05 % en magasin."
  },
  {
    id:"belle-adresse-xtra-40", provider:"La Belle Adresse", providerId:"belle-adresse",
    title:"X.TRA — offre de remboursement", type:"ODR", category:"entretien",
    stores:["carrefour","leclerc"], savingPercent:40, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", sourceUrl:"https://www.labelleadresse.com/economies/remboursement",
    scope:"produit", stacking:"non cumulable avec certaines promotions/réductions",
    conditions:"La Belle Adresse affiche plusieurs références X.TRA à 40 % remboursé. Vérifier la référence exacte et les modalités."
  },
  {
    id:"belle-adresse-lechat-40", provider:"La Belle Adresse", providerId:"belle-adresse",
    title:"Le Chat Discs — offre de remboursement", type:"ODR", category:"entretien",
    stores:["carrefour","leclerc"], savingPercent:40, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", sourceUrl:"https://www.labelleadresse.com/economies/remboursement",
    scope:"produit", stacking:"non cumulable avec certaines promotions/réductions",
    conditions:"Offre affichée à 40 % remboursé ; les réductions La Belle Adresse ne sont généralement pas cumulables avec une promotion."
  },
  {
    id:"belle-adresse-mir-40", provider:"La Belle Adresse", providerId:"belle-adresse",
    title:"Mir — offre de remboursement", type:"ODR", category:"entretien",
    stores:["carrefour","leclerc"], savingPercent:40, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", sourceUrl:"https://www.labelleadresse.com/economies/remboursement",
    scope:"produit", stacking:"non cumulable avec certaines promotions/réductions",
    conditions:"Plusieurs références Mir étaient affichées à 40 % remboursé lors de la vérification."
  }
];
