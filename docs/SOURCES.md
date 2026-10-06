# Sources et stratégie d'intégration

Dernière revue : 2026-10-06.

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
