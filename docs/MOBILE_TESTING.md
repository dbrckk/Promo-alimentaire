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
