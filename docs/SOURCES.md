# Sources et stratégie d'intégration

Dernière revue : 2026-10-07.

## Priorité 1 — indispensables aux courses

| Source | Valeur | Intégration visée |
|---|---|---|
| Shopmium | ODR produit jusqu'à remboursement intégral selon offre | partenariat/API ou lien profond |
| Coupon Network | ODR, coupons, challenges | partenariat/API ; ne pas contourner l'authentification |
| Fidme Courses | ODR + bons d'achat + catalogues | partenariat/flux public autorisé |
| Bonial | catalogues et promotions locales | flux/partenariat |
| Carrefour | prix, Club, PASS, promos enseigne | données publiques/partenaires autorisées |
| E.Leclerc | prix et avantages locaux | données publiques/partenaires autorisées |

## Priorité 2 — optimisation du paiement

- eBuyClub
- Widilo
- Poulpeo
- Joko
- iGraal

Le moteur compare leurs taux mais ne doit jamais activer plusieurs traceurs d'affiliation incompatibles en même temps. Pour un achat donné, l'application doit recommander **le meilleur chemin valide** plutôt que d'additionner artificiellement des cashbacks non cumulables.

## Priorité 3 — remboursements/coupons complémentaires

- FidMarques
- La Belle Adresse
- Envie de Plus
- Ma vie en couleurs
- Wanteeed
- Dealabs
- Anti-Crise
- Ma Reduc

## Priorité 4 — anti-gaspillage

- Too Good To Go
- Phenix

Ces deux sources ne comparent pas toujours une référence produit précise : elles doivent apparaître séparément des promotions classiques afin de ne pas fausser le classement produit.

## Règles produit

1. Chaque donnée chiffrée doit garder `sourceUrl` et `verifiedAt`.
2. Une économie en euros n'est calculée que si le prix de référence est connu.
3. Une économie combinée n'est affichée que lorsque les règles de cumul sont connues.
4. Les offres expirées sont masquées.
5. Les prix doivent être associés à un magasin/zone quand l'enseigne varie localement.
6. Aucun endpoint privé d'application mobile, contournement d'authentification ou mécanisme anti-bot ne doit être utilisé.
7. Préférer API officielles, flux d'affiliation, partenariats, open data et saisie communautaire vérifiable.

## Schéma cible d'une offre

```js
{
  id,
  ean,
  retailer,
  storeId,
  title,
  basePrice,
  promoPrice,
  savingAmount,
  savingPercent,
  provider,
  type,
  startsAt,
  expiresAt,
  stackingPolicy,
  sourceUrl,
  verifiedAt
}
```


## Données produit et prix ouvertes

### Open Food Facts

Endpoint recommandé pour un nouveau développement : API v3 produit par code-barres.

- Documentation : https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/
- Usage dans le projet : nom, marque, quantité, image, Nutri-Score et rapprochement EAN/GTIN.

### Open Prices

Open Prices fournit des observations de prix ouvertes et datées, associées à un produit et une localisation.

- Documentation générale : https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/product-prices/
- Liste des prix : https://openfoodfacts.github.io/documentation/docs/Open-prices/prices/prices_list/
- Filtres utiles : `product_code`, `currency`, `date`, `price_is_discounted`, `location_id`, latitude/longitude/rayon.
- Le projet filtre ensuite la marque/nom OSM du magasin pour Carrefour ou E.Leclerc.

### Limites assumées

- La couverture Open Prices est communautaire et donc incomplète.
- Un prix ancien n'est jamais présenté comme prix actuel.
- L'absence d'observation n'est jamais interprétée comme absence du produit en magasin.
- Les prix propriétaires récupérés via endpoints mobiles privés ou contournements anti-bot sont exclus.


## Recherche de prix à proximité

L'API Open Prices accepte directement les paramètres géographiques sur `GET /api/v1/prices` :

- `lat`
- `lon`
- `radius_km`
- `product_code`

Dans l'interface, ces paramètres ne sont envoyés qu'après une action volontaire « Autour de moi ». Les coordonnées restent uniquement en mémoire de la page et sont supprimées quand le mode proximité est désactivé.

Le rayon initial est de 25 km. L'application continue ensuite à filtrer les résultats sur l'enseigne sélectionnée (Carrefour ou E.Leclerc).
