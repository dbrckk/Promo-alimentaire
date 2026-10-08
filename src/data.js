export const DATASET_DATE = "2026-10-07";

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
  },
  // Additional sources verified against their own public pages on 2026-10-08.
  // These are DISCOVERY links, not live offers or stackable basket discounts.
  {
    id:"carrefour-testeurs",name:"MonAvisLeRendGratuit",kinds:["tests gratuits","produits alimentaires"],priority:"essentiel",
    stores:["carrefour"],segment:"food",potentialFree:true,
    targetLabel:"Hypermarchés Carrefour participants",
    url:"https://communaute-testerdesproduits.carrefour.fr/demenagement",
    verificationUrl:"https://www.carrefour.fr/faq?question=qu-est-ce-que-monavislerendgratuit-83044",
    discoveryVerifiedAt:"2026-10-08",
    note:"Produits gratuits contre avis via la Communauté Carrefour. Réservé aux hypermarchés participants, sélection, crédits et conditions du programme."
  },
  {
    id:"geev",name:"Geev",kinds:["dons alimentaires","gratuit"],priority:"essentiel",
    stores:[],segment:"food",potentialFree:true,targetLabel:"Dons entre particuliers, selon la ville",
    url:"https://www.geev.com/fr/annonces-gratuites/nourriture",
    verificationUrl:"https://www.geev.com/fr/annonces-gratuites/nourriture",
    discoveryVerifiedAt:"2026-10-08",
    note:"Récupération gratuite de nourriture proche de chez soi ; annonces et disponibilité variables. Ne pas confondre don et remboursement."
  },
  {
    id:"hophopfood",name:"HopHopFood",kinds:["dons alimentaires","solidarité"],priority:"essentiel",
    stores:[],segment:"food",potentialFree:true,targetLabel:"Dons de proximité, accès et critères à vérifier",
    url:"https://www.hophopfood.org/",verificationUrl:"https://www.hophopfood.org/",
    discoveryVerifiedAt:"2026-10-08",
    note:"Dons alimentaires de particuliers et de professionnels et garde-mangers solidaires. Les modalités et les zones couvertes sont à vérifier."
  },
  {
    id:"lidl-plus",name:"Lidl Plus",kinds:["coupons","fidélité"],priority:"fort",
    stores:[],segment:"food",targetLabel:"Lidl uniquement",
    url:"https://www.lidl.fr/c/lidl-plus/s10017570",
    verificationUrl:"https://www.lidl.fr/c/lidl-plus/s10017570",
    discoveryVerifiedAt:"2026-10-08",
    note:"Application gratuite : coupons à activer, points fidélité, offres et tickets numériques. Dépend du magasin et du compte."
  },
  {
    id:"carte-u",name:"Carte U / Mon Magasin U",kinds:["fidélité","coupons","cagnotte"],priority:"fort",
    stores:[],segment:"food",targetLabel:"Super U / Hyper U / U Express participants",
    url:"https://www.magasins-u.com/carte-u",
    verificationUrl:"https://www.magasins-u.com/carte-u",
    discoveryVerifiedAt:"2026-10-08",
    note:"Bons plans et euros Carte U, parfois offres bonifiées ; activation et magasins participants à vérifier. Crédit fidélité ≠ baisse immédiate en caisse."
  },
  {
    id:"auchan-waaoh",name:"Auchan Waaoh!",kinds:["fidélité","cagnotte","défis"],priority:"fort",
    stores:[],segment:"food",targetLabel:"Auchan / Auchan Drive",
    url:"https://www.auchan.fr/programme-fidelite/ep-programme-fidelite",
    verificationUrl:"https://www.auchan.fr/programme-fidelite/ep-programme-fidelite",
    discoveryVerifiedAt:"2026-10-08",
    note:"Euros cagnottés, offres personnalisées et défis. Conditions de cumul et sélection de produits à vérifier ; non assimilés à un remboursement bancaire."
  },
  {
    id:"intermarche-app",name:"Intermarché : e-coupons",kinds:["e-coupons","fidélité"],priority:"fort",
    stores:[],segment:"food",targetLabel:"Intermarché participants",
    url:"https://www.intermarche.com/aide-et-contact/jeux-et-operations-commerciales",
    verificationUrl:"https://www.intermarche.com/aide-et-contact/jeux-et-operations-commerciales",
    discoveryVerifiedAt:"2026-10-08",
    note:"E-coupons dans l'application pour détenteurs de la carte de fidélité. Nécessite activation et vérification des conditions."
  },
  {
    id:"nous-antigaspi",name:"NOUS anti-gaspi",kinds:["épicerie anti-gaspi","prix réduits"],priority:"fort",
    stores:[],segment:"food",targetLabel:"Épiceries NOUS selon implantation",
    url:"https://www.nousantigaspi.com/",
    verificationUrl:"https://www.nousantigaspi.com/les-produits-a-marque-nous/",
    discoveryVerifiedAt:"2026-10-08",
    note:"Épiceries de produits sauvés et marque NOUS à prix réduit. Une économie doit être comparée produit par produit, sans taux uniforme."
  },
  {
    id:"trnd",name:"TRND",kinds:["tests gratuits","candidature"],priority:"fort",
    stores:[],segment:"food",potentialFree:true,targetLabel:"Campagnes France, sélection requise",
    url:"https://www.trnd.com/fr/projets",
    verificationUrl:"https://www.trnd.com/fr/info/a-propos/faq",
    discoveryVerifiedAt:"2026-10-08",
    note:"Tests gratuits possibles de produits alimentaires et du quotidien. Candidature, sélection et éventuelles obligations de retour d'avis."
  },
  {
    id:"home-tester-club",name:"Home Tester Club",kinds:["tests gratuits","candidature"],priority:"fort",
    stores:[],segment:"food",potentialFree:true,targetLabel:"Campagnes nationales, sélection requise",
    url:"https://www.hometesterclub.com/fr/fr/",
    verificationUrl:"https://www.hometesterclub.com/fr/fr/",
    discoveryVerifiedAt:"2026-10-08",
    note:"Campagnes de produits gratuits à tester, parfois alimentaires. Inscription et sélection, sans certitude de recevoir un produit."
  },
  {
    id:"thefork",name:"TheFork",kinds:["restaurant","réservation remisée"],priority:"fort",
    stores:[],segment:"food",advertisedMaxPercent:50,targetLabel:"Restaurants partenaires",
    url:"https://www.thefork.fr/",
    verificationUrl:"https://www.thefork.fr/restaurant/la-taverne-de-l-olympia-r28184?=24751-923",
    discoveryVerifiedAt:"2026-10-08",
    note:"Certaines réservations affichent jusqu'à -50 % sur les éléments éligibles de la carte. Vérifier créneau, exclusions, menus et boissons."
  },
  {
    id:"soliguide",name:"Soliguide",kinds:["aide alimentaire","annuaire solidaire"],priority:"essentiel",
    stores:[],segment:"food",targetLabel:"Services sociaux et associations selon la commune",
    url:"https://soliguide.fr/",verificationUrl:"https://soliguide.fr/",
    discoveryVerifiedAt:"2026-10-08",
    note:"Recherche de distributions de repas, paniers, épiceries sociales, bons alimentaires et frigos solidaires. Gratuité et conditions propres à chaque structure."
  },
  {
    id:"linkee-etudiants",name:"Linkee (étudiants)",kinds:["colis alimentaires","dons"],priority:"fort",
    stores:[],segment:"food",potentialFree:true,targetLabel:"Étudiants, villes et créneaux disponibles",
    url:"https://linkee.co/beneficiaires/",verificationUrl:"https://linkee.co/beneficiaires/",
    discoveryVerifiedAt:"2026-10-08",
    note:"Distributions alimentaires gratuites sur inscription avec justificatif étudiant. Une offre d'aide, pas un cashback ni une promotion en caisse."
  },
  {
    id:"veepee",name:"Veepee",kinds:["ventes privées","mode","maison"],priority:"fort",
    stores:[],segment:"other",advertisedMaxPercent:70,targetLabel:"Ventes privées en ligne",
    url:"https://www.veepee.fr/gr/home/default",
    verificationUrl:"https://www.veepee.fr/gr/home/default",
    discoveryVerifiedAt:"2026-10-08",
    note:"Jusqu'à -70 % selon les ventes et références. Seules les offres individuelles vérifiées à -50 % ou plus répondent au filtre hors alimentaire."
  },
  {
    id:"showroomprive",name:"Showroomprivé",kinds:["ventes privées","mode","maison"],priority:"fort",
    stores:[],segment:"other",advertisedMaxPercent:70,targetLabel:"Ventes privées en ligne",
    url:"https://www.showroomprive.com/Ventes-privees/default.aspx",
    verificationUrl:"https://www.showroomprive.com/Ventes-privees/default.aspx",
    discoveryVerifiedAt:"2026-10-08",
    note:"Ventes privées annoncées jusqu'à -70 %. Prix de référence, frais et taux de chaque article à contrôler avant achat."
  }

];

export const offers = [
  {
    id:"fidme-carrefour-giftcard-4", provider:"Fidme Courses", providerId:"fidme-courses",
    title:"Bon d'achat Carrefour remisé", type:"bon d'achat", category:"panier",
    stores:["carrefour"], channels:["store"], savingPercent:4, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", reviewAfter:"2026-10-13", sourceUrl:"https://www.fidme.com/nos-services/app-fidme-course/",
    scope:"panier", stacking:"généralement cumulable avec promos magasin, vérifier les exclusions",
    mechanism:"gift_card", stackGroup:"payment-discount", stackOrder:30, savingBasis:"current",
    autoStack:true, stackingConfidence:"high",
    conditions:"Exemple officiel Fidme : bon Carrefour de 100 € acheté 96 €. Conditions exactes à contrôler avant achat."
  },
  {
    id:"widilo-carrefour-giftcard-4", provider:"Widilo", providerId:"widilo",
    title:"Carte cadeau Carrefour", type:"bon d'achat", category:"panier",
    stores:["carrefour"], channels:["store"], savingPercent:4, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", reviewAfter:"2026-10-13", sourceUrl:"https://www.widilo.fr/bon-d-achat/carrefour",
    scope:"panier", stacking:"paiement par bon ; cumul selon conditions Carrefour",
    mechanism:"gift_card", stackGroup:"payment-discount", stackOrder:30, savingBasis:"current",
    autoStack:true, stackingConfidence:"high",
    conditions:"Widilo affiche 4 % de cashback sur la carte cadeau Carrefour. Validité et canaux d'utilisation à vérifier sur la fiche."
  },
  {
    id:"ebuyclub-carrefour-giftcard-36", provider:"eBuyClub", providerId:"ebuyclub",
    title:"Carte cadeau Carrefour", type:"bon d'achat", category:"panier",
    stores:["carrefour"], channels:["store"], savingPercent:3.6, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", reviewAfter:"2026-10-13", sourceUrl:"https://www.ebuyclub.com/selection-bons-d-achat/carrefour-10310",
    scope:"panier", stacking:"paiement par bon ; vérifier exclusions",
    mechanism:"gift_card", stackGroup:"payment-discount", stackOrder:30, savingBasis:"current",
    autoStack:true, stackingConfidence:"high",
    conditions:"eBuyClub affiche 3,6 % remboursés immédiatement sur la carte cadeau Carrefour."
  },
  {
    id:"poulpeo-carrefour-giftcard-36", provider:"Poulpeo", providerId:"poulpeo",
    title:"Bon d'achat Carrefour", type:"bon d'achat", category:"panier",
    stores:["carrefour"], channels:["store"], savingPercent:3.6, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", reviewAfter:"2026-10-13", sourceUrl:"https://www.poulpeo.com/cashback-bon-d-achat.html",
    scope:"panier", stacking:"paiement par bon ; vérifier exclusions",
    mechanism:"gift_card", stackGroup:"payment-discount", stackOrder:30, savingBasis:"current",
    autoStack:true, stackingConfidence:"high",
    conditions:"Poulpeo affiche 3,6 % de cashback immédiat sur le bon d'achat Carrefour en magasin."
  },
  {
    id:"ebuyclub-carrefour-connected-005", provider:"eBuyClub", providerId:"ebuyclub",
    title:"Cashback connecté Carrefour", type:"cashback carte", category:"panier",
    stores:["carrefour"], channels:["store"], savingPercent:0.05, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", reviewAfter:"2026-10-13", sourceUrl:"https://www.ebuyclub.com/cashback-connecte",
    scope:"panier", stacking:"à vérifier selon transaction et autres activations",
    mechanism:"card_cashback", stackGroup:"card-cashback", stackOrder:60, savingBasis:"current",
    autoStack:false, stackingConfidence:"unknown",
    conditions:"Taux affiché au moment de la vérification : 0,05 % en magasin."
  },
  {
    id:"ebuyclub-leclerc-connected-005", provider:"eBuyClub", providerId:"ebuyclub",
    title:"Cashback connecté E.Leclerc", type:"cashback carte", category:"panier",
    stores:["leclerc"], channels:["store"], savingPercent:0.05, savingAmount:null, basePrice:null,
    verifiedAt:"2026-10-06", reviewAfter:"2026-10-13", sourceUrl:"https://www.ebuyclub.com/cashback-connecte",
    scope:"panier", stacking:"à vérifier selon transaction et autres activations",
    mechanism:"card_cashback", stackGroup:"card-cashback", stackOrder:60, savingBasis:"current",
    autoStack:false, stackingConfidence:"unknown",
    conditions:"Taux affiché au moment de la vérification : 0,05 % en magasin."
  },
];
