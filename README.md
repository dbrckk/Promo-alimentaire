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
- moteur de cumul prudent qui choisit le meilleur chemin valide sans additionner les offres incompatibles ;
- simulateur d'optimisation d'un panier ;
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
- `src/app.js` : interface, scanner et état local.
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

1. Associer automatiquement les offres ODR/coupons à des EAN précis.
2. Ajouter la localisation volontaire pour privilégier les observations de prix proches.
3. Ajouter historique des prix et score de fraîcheur/confiance.
4. Ajouter des connecteurs d'ingestion autorisés pour les catalogues et offres.
5. Déployer la PWA en HTTPS pour test Android réel.

Voir `docs/SOURCES.md` pour la stratégie d'intégration.
