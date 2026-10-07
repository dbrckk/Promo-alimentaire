# Promo Alimentaire

PWA mobile-first pour regrouper et comparer les économies disponibles chez **Carrefour** et **E.Leclerc** : promotions, cashback, offres de remboursement (ODR), coupons, bons d'achat remisés et prix observés.

## État

Fonctionnalités actuelles :
- choix Carrefour / E.Leclerc ;
- tri par pourcentage d'économie, économie en euros ou fraîcheur ;
- recherche d'offres ;
- annuaire de sources complémentaires ;
- recherche produit par EAN/UPC ;
- scanner code-barres natif sur les navigateurs compatibles Android ;
- fiche produit via Open Food Facts ;
- observations de prix Carrefour/E.Leclerc via Open Prices ;
- mode proximité volontaire avec rayon 5/10/25/50 km, distance magasin et aucune persistance des coordonnées ;
- rapprochement d'un produit scanné avec les offres du registre (EAN exact ou candidat marque/nom) ;
- estimation prudente du gain potentiel sur un prix récent ;
- moteur de cumul prudent qui choisit le meilleur chemin valide sans additionner les offres incompatibles ;
- simulateur d'optimisation d'un panier ;
- liste de courses persistante sur l'appareil avec quantités ;
- actualisation des mêmes références chez Carrefour et E.Leclerc ;
- comparaison des deux paniers avec refus de déclarer un gagnant si la couverture prix est incomplète ;
- regroupement des prix par point de vente physique pour éviter de mélanger plusieurs magasins d'une même enseigne ;
- préférence automatique pour les prix ≤30 jours, avec repli jusqu'à 120 jours seulement si nécessaire ;
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
- `src/basket.js` : évaluation d'une liste par enseigne et comparaison prudente.
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

## Priorités suivantes

1. Alimenter les offres avec des EAN/GTIN **vérifiés par la source** afin de faire passer les candidats en correspondances exactes.
2. Ajouter historique des prix et score de fraîcheur/confiance.
3. Ajouter un historique local des comparaisons de panier et un indicateur de confiance global.
4. Ajouter des connecteurs d'ingestion autorisés pour les catalogues et offres.
5. Déployer la PWA en HTTPS pour test Android réel.

Voir `docs/SOURCES.md` pour la stratégie d'intégration et `docs/MATCHING.md` pour les règles de rapprochement produit/offre.
