# Promo Alimentaire

PWA mobile-first pour regrouper et comparer les économies disponibles chez **Carrefour** et **E.Leclerc** : promotions, cashback, offres de remboursement (ODR), coupons, bons d'achat remisés et prix observés.

## État

Fonctionnalités actuelles :
- choix Carrefour / E.Leclerc ;
- tri par pourcentage d'économie, économie en euros ou fraîcheur ;
- recherche d'offres ;
- chargement runtime de snapshots publics validés (Shopmium, La Belle Adresse, Coupon Network et Envie de Plus au 07/10/2026) avec expiration automatique ;
- contrôle quotidien de fraîcheur des snapshots via GitHub Actions, avec signalement des sources devenues entièrement obsolètes ;
- annuaire de sources complémentaires ;
- recherche produit par EAN/UPC ;
- scanner code-barres natif sur les navigateurs compatibles Android ;
- fiche produit via Open Food Facts ;
- observations de prix Carrefour/E.Leclerc via Open Prices ;
- mode proximité volontaire avec rayon 5/10/25/50 km, distance magasin et aucune persistance des coordonnées ;
- rapprochement d'un produit scanné avec les offres du registre (EAN exact ou candidat marque/nom) ;
- estimation prudente du gain potentiel sur un prix récent ;
- offres multi-produits modélisées séparément (ex. Dash + Lenor), sans les intégrer automatiquement au coût garanti ;
- moteur de cumul prudent qui choisit le meilleur chemin valide sans additionner les offres incompatibles ;
- simulateur d'optimisation d'un panier ;
- liste de courses persistante sur l'appareil avec quantités ;
- actualisation des mêmes références chez Carrefour et E.Leclerc ;
- comparaison des deux paniers avec refus de déclarer un gagnant si la couverture prix est incomplète ;
- regroupement des prix par point de vente physique pour éviter de mélanger plusieurs magasins d'une même enseigne ;
- préférence automatique pour les prix ≤30 jours, avec repli jusqu'à 120 jours seulement si nécessaire ;
- score de confiance explicable sur 100 par scénario (couverture, fraîcheur, identification du magasin, preuve Open Prices) ;
- historique local limité aux 20 dernières comparaisons, sans stockage des coordonnées ;
- tendance du coût entre les dernières comparaisons valides ;
- historique de prix local par produit et par enseigne ;
- alertes locales de baisse de prix avec seuil configurable 5/10/15/20 %, évaluées lors des actualisations ;
- PWA installable et fonctionnement hors ligne pour l'interface ;
- tests métier sans dépendance externe.

## Principe de fiabilité

Une remise n'est ajoutée au total automatique que si le modèle de cumul est suffisamment connu. Une offre au cumul incertain reste visible mais n'augmente pas artificiellement l'économie annoncée.

Les observations de prix Open Prices sont communautaires et datées. L'absence d'un prix ne signifie pas qu'un produit n'est pas vendu dans l'enseigne.

## Données ouvertes

- **Open Food Facts** : identification produit par code-barres et métadonnées produit.
- **Open Prices** : observations de prix, remises, date et localisation/magasin.

Ces sources permettent d'éviter l'utilisation d'API privées Carrefour/E.Leclerc. Les connecteurs futurs doivent privilégier API officielles, partenariats, flux autorisés et données ouvertes.

## Sources d'économies référencées

Shopmium, Coupon Network, Fidme Courses, FidMarques, Joko, eBuyClub, Poulpeo, Widilo, iGraal, Wanteeed, Bonial, La Belle Adresse, Dealabs, Envie de Plus, Ma vie en couleurs, Anti-Crise, Ma Reduc, Too Good To Go, Phenix, Club Carrefour/PASS et E.Leclerc.

## Architecture

- `src/data.js` : registre des sources et snapshot d'offres vérifiées.
- `src/domain.js` : calculs, filtrage et classement.
- `src/open-data.js` : Open Food Facts + Open Prices, normalisation EAN/prix.
- `src/stacking.js` : moteur de compatibilité et de cumul.
- `src/matching.js` : rapprochement EAN/GTIN et règles marque/nom.
- `src/bundle.js` : détection et estimation prudente des offres multi-produits.
- `src/basket.js` : évaluation d'une liste par enseigne et comparaison prudente.
- `src/confidence.js` : score de confiance explicable des scénarios.
- `src/history.js` : snapshots locaux et tendances de comparaison.
- `src/product-history.js` : historique par produit, tendances et détection de baisse.
- `src/gtin.js` : normalisation et checksum GTIN/EAN.
- `src/ingestion.js` : validation des lots d'offres traçables.
- `src/import-loader.js` : chargement des snapshots actifs et rejet des lots invalides.
- `scripts/validate-imports.mjs` : porte CI pour les fichiers `data/import/*.json`.
- `src/app.js` : interface, scanner, liste de courses et état local.
- `tests/` : tests du domaine, ingestion ouverte et moteur de cumul.
- aucun backend requis pour le MVP.

## Lancer

```bash
python3 -m http.server 4173
```

Puis ouvrir `http://localhost:4173`.

> Le scanner caméra nécessite un contexte sécurisé (HTTPS) hors localhost. Un hébergement GitHub Pages/Vercel/Cloudflare Pages conviendra.

## Vérifier

```bash
npm run verify
```

La commande vérifie aussi automatiquement les futurs lots `data/import/*.json`.

Contrôle manuel de fraîcheur :

```bash
npm run check:freshness
```

## Priorités suivantes

1. Alimenter les offres avec des EAN/GTIN **vérifiés par la source** afin de faire passer les candidats en correspondances exactes.
2. Enrichir l'historique avec l'évolution **par produit** quand plusieurs observations existent.
3. Ajouter des alertes locales sur baisse de prix / nouvelle ODR après ingestion fiable.
4. Ajouter des connecteurs d'ingestion autorisés pour les catalogues et offres.
5. Déployer la PWA en HTTPS pour test Android réel.

Voir `docs/SOURCES.md` pour la stratégie d'intégration, `docs/MATCHING.md` pour le rapprochement produit/offre et `docs/INGESTION.md` pour le pipeline EAN vérifié.
