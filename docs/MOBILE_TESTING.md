## Protection contre les coordonnées fictives (0,0)

Le parcours Android Pixel 7 valide que deux relevés Open Prices prétendument à `(0,0)` mais portant le même code postal ne créent jamais un gagnant Carrefour/E.Leclerc et ne constituent pas un panier dans un point de vente identifié. Les coordonnées valides continuent d'être acceptées. Les relevés fictifs restent uniquement des observations indicatives.

## Choix du magasin à prix récents

Le smoke Chrome Android vérifie deux magasins Carrefour pour un même code-barres : un magasin à 1,50 € sur un relevé vieux de 13 jours et un autre à 3,30 € avec un relevé d'hier. Le second doit être sélectionné pour une comparaison locale avec un E.Leclerc proche à 3,80 € daté d'hier ; le ticket ancien reste disponible en indication, sans masquer le magasin récent. Les critères de panier complet, rayon géographique, rapprochement de magasins et caution sur la fiabilité restent inchangés.

## Comparaison de panier entre deux magasins distants

Le parcours Chrome Android inclut deux paniers complets issus de magasins physiques identifiés : à environ 2 km, le comparateur peut annoncer le meilleur scénario observé ; à plus de 15 km, il ne doit pas annoncer de gagnant, même si les deux magasins sont inclus dans un même rayon de recherche de 50 km. Les prix restent indicatifs et la règle n'affecte pas les remises individuelles.

## Rafraîchissement parallèle du panier et prix local isolé

Le parcours Android existant simule **cinq produits à codes GTIN distincts** et une API Open Prices lente. Il vérifie que deux à trois recherches peuvent se chevaucher mais que jamais plus de trois produits ne sont téléchargés simultanément, et que les requêtes identiques restent mutualisées entre Carrefour et E.Leclerc. Il annule ensuite une mise à jour contenant des prix de test inhabituels ; le budget et le contenu **persisté** de l'historique ne doivent pas changer. Enfin, en mode **panier limité à une commune**, un scan national suivi de « Ajouter à la liste » ne doit pas injecter ces relevés hors secteur dans le budget local. Les prix du panier local ne sont renseignés qu'après « Actualiser les prix ».

### Liste de courses locale sans GPS

Dans **Liste de courses**, saisir un code postal dans **Prix de la liste près d'une commune, sans GPS** puis rechercher. Si plusieurs communes correspondent, sélectionner celle souhaitée (71100 : Chalon-sur-Saône ou Saint-Marcel), choisir un rayon 5/10/25/50 km dans la barre de la liste, puis **Actualiser les prix**. La zone de résultat doit rappeler la commune et le rayon ; les relevés d'un magasin situé hors rayon et les prix personnels sans coordonnées ne doivent pas influencer le total. Le choix de commune n'appelle pas `navigator.geolocation` et n'est pas sauvegardé. Modifier code postal/rayon, changer de commune ou effacer le secteur doit retirer immédiatement les anciennes estimations. Le smoke Pixel 7 teste les paramètres réels des requêtes, l'absence de mélange des secteurs et les prix non géolocalisables.

## Panier : isolation des prix magasin / Drive / En ligne

Après avoir actualisé la liste en canal **Magasin**, basculer vers **Drive** puis **En ligne**. Le panier ne doit conserver **aucun montant calculé à partir des relevés de magasins physiques**, même si ces relevés sont dans l'historique de l'onglet. Appuyer sur **Actualiser les prix** dans ces canaux affiche un message explicite et n'envoie aucune requête à Open Prices. Revenir à **Magasin** permet de revoir les observations datées et leurs liens de preuve, puis de réactualiser manuellement.

Le parcours mobile automatisé simule une paire de prix UPC/EAN chez Carrefour et E.Leclerc, contrôle l'absence de prix Drive et l'absence d'appels réseau, et vérifie la restitution du mode magasin.

## Panier Android : prix UPC/EAN et garde-fou des sept jours

Sur une liste contenant un UPC-A valide, l'actualisation consulte les variantes EAN-13/GTIN-14 uniquement si aucun relevé du même produit ne satisfait les **sept derniers jours**. Les recherches Carrefour et Leclerc partagent les pages Open Prices, sans mélanger les enseignes. Le statut affiche les variantes tentées et les relevés supplémentaires récupérés. Si un prix de huit jours reste affiché comme contexte, **aucun remboursement ni coupon ne doit être déduit automatiquement de ce prix** ; un prix de 7 jours et quelques heures est également trop ancien, même si l'interface indique « 7 jours révolus ».

Le test Pixel 7 vérifie avec des réponses HTTP simulées : preuve ancienne UPC, deux preuves récentes EAN du même produit (magasins distincts), prix d'un autre GTIN rejeté, deux URL de justificatifs vérifiables, deux appels réseau uniques et aucune réduction automatique sur prix ancien. Ne pas confondre cette validation avec les prix actuels en magasin.

## Annulation de la géolocalisation du produit ou du panier

Dans **Produit**, appuyer sur **Autour de moi** : tant que l'autorisation attend, le bouton doit afficher **Annuler la localisation**. Aller dans **Liste de courses** et l'utiliser pour annuler ; une réponse GPS retardée ne doit pas activer le mode local. Une nouvelle demande valide doit activer la proximité, puis un second appui la désactiver et supprimer la position utilisée. Les coordonnées invalides ou les erreurs de permission ne doivent pas laisser le mode actif. Le contrôle Android automatisé simule les réponses différées, sans requérir de véritable position GPS.

Les prix et gains de l'ancien magasin/rayon doivent disparaître pendant le chargement du nouveau contexte, même en cas d'échec de l'API.

## Cohérence des estimations de remboursement selon les preuves

Le test Chrome Android existant contrôle désormais aussi le **comparateur exact EAN** : une source non reconfirmée, une carte fidélité absente ou d'un niveau insuffisant, et une confirmation de magasin/canal manquante suppriment les chiffres d'économie et de « coût après remboursement ». La mention du motif doit rester lisible. Une offre fictive avec le même GTIN, un relevé ordinaire de moins de 7 jours, une source sans alerte et la carte requise conserve uniquement une **estimation conditionnelle**. Les décisions du comparateur doivent être cohérentes avec `canEstimateProductOffer`, déjà appliqué sur la fiche produit.

## Fiabilité des économies calculées sur un produit scanné

Le scénario Chrome Android existant évalue les fonctions réellement utilisées dans la fiche produit sur les cas suivants : relevé normal daté de moins de 7 jours, autre enseigne, autre GTIN, devises incorrectes, relevé de 12 jours, prix déjà remisé, Drive, distance hors rayon, absence de distance et exigences supplémentaires de fidélité, de magasin ou de confirmation de prix. Une offre avec EAN exact et justificatifs suffisants peut recevoir une **estimation indicative**, alors qu'une correspondance approximative par marque ou un relevé périmé ne le peut pas. Le scénario s'exécute sans accès au GPS de l'utilisateur.

## Pagination selon les preuves utilisables

Le parcours Android Pixel 7 simule une première page Open Prices contenant quatre relevés datant de 9 à 12 jours, puis une seconde page contenant un relevé de 2 jours. Le comparateur doit consulter les deux pages pour sa fenêtre de 7 jours. La consultation ordinaire garde sa limite de 30 jours, peut s'arrêter à la première page et signale alors que d'autres données peuvent exister.

## Variante UPC/EAN et fraîcheur du comparateur

Le parcours Chrome Android vérifie que la comparaison des enseignes recherche un EAN-13 équivalent quand le UPC-A ne fournit qu'un prix de 12 jours, même si celui-ci reste affichable dans l'historique. Une fiche produit ordinaire conserve le seuil de 30 jours et ne télécharge pas ces variantes. Si une première variante ne contient qu'un relevé de 11 jours, la seconde variante GTIN-14 est aussi consultée. Les correspondances reposent sur le contrôle GS1 et non sur la similarité des noms de produits.

## Magasins réellement comparés et emplacement public

Ouvrir **Produit**, scanner le même EAN pour Carrefour et E.Leclerc puis comparer. Lorsque la paire a des coordonnées Open Prices vérifiables, sous « Relevés retenus pour la comparaison locale », vérifier deux cartes montrant l'enseigne, le prix, la date, le lieu, la distance à vol d'oiseau le cas échéant, et un lien vers le marqueur du magasin sur OpenStreetMap. Aucun centre de commune ni GPS personnel ne doit figurer dans l'URL. Sans coordonnées, afficher une absence de position cartographique vérifiable, **jamais un marqueur inventé**.

Le scénario Playwright **Pixel 7 existant** vérifie deux marqueurs d'enseignes distincts, les coordonnées de lien, les valeurs malformées et l'ordre de préférence de deux couples de magasins à la même date. La fraîcheur des tickets reste prioritaire à la proximité, et les tests 320/360/393 px continuent d'interdire le débordement horizontal.

## Comparaison par code postal (sans autorisation GPS)

Dans **Produit**, entrer un code postal dans le formulaire **Comparer les magasins d'un secteur sans GPS**. Si plusieurs communes partagent ce code, sélectionner la localité explicitement. Choisir 5, 10, 25 ou 50 km, scanner/saisir l'EAN puis lancer le comparateur. La zone affichée doit indiquer un centre de commune approximatif, le rayon choisi, et **aucun prix ne doit venir d'un relevé situé hors rayon**. Changer le code, le rayon ou la commune doit effacer l'ancienne comparaison ; l'option Effacer supprime toute recherche locale. Les modes Drive/livraison continuent de refuser les prix magasin.

Le smoke Pixel 7 du projet émule plusieurs communes françaises pour `71100`, vérifie les paramètres Open Prices transmis, les annulations et les limites géographiques. La validation n'utilise aucune position réelle du téléphone.

# Tester Promo Alimentaire sur Android

Le test automatisé utilise **Chromium avec émulation de Pixel 7** (format tactile Android). Il teste le logiciel, mais ne simule pas une caméra physique, une position GPS réelle, les contraintes du Play Store ou un vrai paiement. Un test sur téléphone demeure nécessaire.

## Test automatique et captures

GitHub → Actions → **Android viewport smoke test** → dernier run réussi → **Artifacts → android-mobile-smoke**.

Le workflow `.github/workflows/mobile-smoke.yml` lance un serveur statique local puis `scripts/mobile-smoke.mjs`. Il teste :

1. affichage des offres et absence de défilement horizontal à 393, 360 et 320 px ;
2. changement de canal, tri et profil fidélité ;
3. recherche d'un produit par EAN via des réponses de test contrôlées ;
4. ajout à la liste, actualisation des prix et affichage du panier ;
5. mise à jour de l'optimiseur ;
6. conservation du panier et des paramètres après rechargement ;
7. prise de contrôle par le service worker, puis rechargement entièrement hors ligne ;
8. absence d'erreurs JavaScript non gérées et d'erreurs HTTP sur les ressources de l'application.

Le workflow archive `01-offres.png`, `02-panier.png`, `03-optimiseur.png`, `04-hors-ligne.png` et `05-releve-manuel.png` (prix personnel non vérifié).

Les données de produit et de prix utilisées dans ce test sont **simulées**. Elles ne constituent pas une validation des promotions commerciales.

## Ouvrir le site sur un téléphone réel

Le dépôt comporte `.github/workflows/pages.yml`, mais **une CI réussie ne prouve pas la publication du site**.

1. Dans le dépôt GitHub, ouvrir **Settings → Pages**.
2. Sous **Build and deployment → Source**, choisir **GitHub Actions**.
3. Dans **Actions**, lancer manuellement **Deploy PWA to GitHub Pages**.
4. Vérifier que les jobs `verify`, `build` et `deploy` réussissent.
5. Ouvrir l'URL exacte publiée par le job `deploy` sur Chrome Android. Ne pas déduire cette URL du nom du dépôt sans publication confirmée.
6. Dans Chrome, choisir **Installer l'application** ou **Ajouter à l'écran d'accueil** si cette option est proposée.

## Vérifications manuelles à effectuer

- **Ouverture** : pas de bande blanche ni de défilement horizontal ; les cinq onglets sont accessibles.
- **Magasin et canal** : passer de Carrefour à E.Leclerc et de Magasin à Drive ; les offres non disponibles pour le canal doivent disparaître.
- **Fidélité** : choisir Club Carrefour, puis PASS ; les 10 % et 15 % ne doivent pas s'additionner. Vérifier la persistance après fermeture/réouverture.
- **Code-barres** : saisir un EAN connu ; vérifier le titre et le magasin associés. Essayer aussi un EAN erroné.
- **Caméra** : appuyer sur **Scanner** ; autoriser la caméra. Le scanner peut rester indisponible selon le navigateur : l'entrée manuelle doit toujours fonctionner.
- **Liste** : ajouter un produit, modifier la quantité, rafraîchir, puis fermer/réouvrir l'application. La liste doit rester enregistrée localement.
- **Autour de moi** : accorder la position ; inspecter le rayon et les noms de magasins. Refuser la permission : l'app doit continuer sans comparaison géolocalisée.
- **Prix** : distinguer prix observé (qui peut dater), remise immédiate, cagnotte et remboursement différé.
- **Relevé manuel** : dans l'onglet Liste, ouvrir le panneau de prix personnel, saisir un produit, un magasin physique, son code postal et un prix. Vérifier le badge non vérifié, l'absence de promotion automatique, la persistance et la suppression. Une promotion non confirmée ne doit pas réduire le coût annoncé comme certain.
- **Hors ligne** : charger une fois l'application en ligne, activer le mode avion, la fermer puis la rouvrir. Les écrans et la liste doivent rester disponibles, tandis que les actualisations réseau indiquent leur indisponibilité.
- **Vérification locale** : une confirmation faite dans un magasin ne doit pas rendre le même avantage garanti dans un autre magasin ou sur le Drive.

## Limites connues

- Les fiches Carrefour consultables sur le Web peuvent répondre **HTTP 403 depuis GitHub Actions** : le robot ne prolonge pas leur validité sans nouvelle preuve.
- Les catalogues E.Leclerc peuvent charger les produits dynamiquement : ils peuvent être lisibles par un navigateur mais non vérifiables par le collecteur automatique.
- Les prix Open Prices sont des **observations communautaires datées**, pas une promesse de prix en caisse.
- Le test Chromium ne couvre pas encore les caractéristiques et autorisations d'un modèle Android physique particulier.

Pour relancer uniquement l'émulation : GitHub → **Actions → Android viewport smoke test → Run workflow**.


### Avertissement de synchronisation inaccessible

Le parcours Android vérifie également que le panneau « État des données importées » signale une dernière tentative de synchronisation indisponible lorsque `data/import/source-sync-status.json` contient ce statut pour Coupon Network. Les dates de validité des offres restent indépendantes de cette alerte.

Le test couvre cette situation **conditionnellement**, afin de continuer à fonctionner lorsque la source redevient accessible et que le statut devient `updated`.


## Scénario : budget de courses (Android)

1. Ouvrir **Liste**, ajouter un produit puis saisir `3,00` dans **Mon budget (€)**.
2. Avant l'actualisation des prix, vérifier qu'un prix manquant ne donne pas un faux statut « budget respecté ».
3. Actualiser les observations ; si le montant en caisse dépasse 3 €, vérifier l'alerte de dépassement.
4. Saisir `6,00` et vérifier que le statut devient indicatif lorsque le canal est Drive ou lorsque le magasin n'est pas suffisamment vérifié.
5. Recharger l'application, puis repasser en mode hors ligne : le budget enregistré doit rester `6,00` et ne doit pas dépendre d'un accès serveur.
6. Ajouter un relevé de prix manuel et confirmer que le montant reste **indicatif**.
7. Vérifier les largeurs 320, 360 et 393 px : aucune barre de défilement horizontale ne doit apparaître.

Ce scénario est également couvert dans le workflow GitHub Actions **Android viewport smoke test**. Les économies fidélité créditées plus tard et les ODR ne sont jamais retirées du plafond de caisse.
