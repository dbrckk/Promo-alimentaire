# Promo Alimentaire

PWA mobile-first pour regrouper les économies disponibles chez **Carrefour** et **E.Leclerc** : cashback, offres de remboursement (ODR), coupons, bons d'achat remisés, catalogues et promotions enseigne.

## État

Version initiale fonctionnelle :
- choix Carrefour / E.Leclerc ;
- tri par pourcentage d'économie, économie en euros ou fraîcheur ;
- recherche ;
- annuaire de sources complémentaires ;
- offres publiques vérifiées avec lien vers la source ;
- fonctionnement hors ligne grâce au service worker ;
- installation PWA sur Android ;
- tests métier sans dépendance externe.

Les offres qui n'ont pas encore de prix magasin ne prétendent pas inventer une économie en euros : l'interface affiche **« dépend du prix »** jusqu'à ce qu'une source de prix fiable soit raccordée.

## Sources actuellement référencées

Shopmium, Coupon Network, Fidme Courses, FidMarques, Joko, eBuyClub, Poulpeo, Widilo, iGraal, Wanteeed, Bonial, La Belle Adresse, Dealabs, Club Carrefour/PASS et E.Leclerc.

## Architecture

- `src/data.js` : registre des sources et snapshot d'offres vérifiées.
- `src/domain.js` : calculs, filtrage et classement.
- `src/app.js` : interface et état local.
- `tests/` : tests du moteur de classement.
- aucun backend requis pour le MVP.

## Lancer

```bash
python3 -m http.server 4173
```

Puis ouvrir `http://localhost:4173`.

## Vérifier

```bash
npm run verify
```

## Prochaine priorité produit

1. Ajouter une couche d'ingestion automatisée **uniquement via API, flux partenaire/affiliation ou pages publiques dont l'accès est autorisé**.
2. Récupérer les prix Carrefour/E.Leclerc par magasin afin de calculer l'économie réelle en euros.
3. Dédupliquer les mêmes produits entre sources par EAN/GTIN.
4. Construire un moteur de cumul : promo enseigne + bon d'achat + ODR + cashback, en respectant les exclusions.
5. Ajouter alertes de nouvelles offres et historique des prix.

Voir `docs/SOURCES.md` pour la stratégie d'intégration.
