# Rapprochement produit ↔ offre

Le moteur doit éviter un faux positif coûteux : une marque identique ne garantit pas que la référence scannée est éligible à une ODR.

## Niveaux

### 1. Exact

Une offre contient explicitement le code dans `eans`.

```js
{
  id: "offer-id",
  scope: "produit",
  eans: ["3017624010701"]
}
```

Le moteur retourne `confidence: "exact"` et un score de 100.

Cela signifie seulement que le **produit** correspond à la référence déclarée. Les dates, quotas, magasins et autres conditions de l'offre restent à vérifier.

### 2. Candidat / probable

Si aucun EAN exact n'est fourni, une offre peut déclarer des règles de recherche :

```js
productMatch: {
  brands: ["Le Chat"],
  any: ["Disc", "Discs", "Disques"],
  all: [],
  minScore: 60
}
```

Ces règles servent à **faire remonter l'offre pour vérification**. Elles ne rendent jamais l'offre automatiquement éligible et ne l'ajoutent jamais à l'économie garantie.

## Principes

1. Un EAN exact a toujours priorité sur un match textuel.
2. Une règle textuelle ne devient jamais `exact`.
3. Une offre d'une autre enseigne est éliminée avant le scoring.
4. La ponctuation et les accents sont normalisés pour la recherche.
5. Une économie en euros n'est estimée que si un prix récent est disponible.
6. Une estimation basée sur une correspondance textuelle est toujours affichée comme **potentielle**.
7. Les EAN ajoutés au registre doivent provenir d'une source vérifiable (conditions officielles, flux partenaire ou donnée source explicite).

## Étape d'ingestion cible

Un connecteur futur doit produire une structure de ce type :

```js
{
  offerId: "source-offer-id",
  eans: ["..."],
  startsAt: "YYYY-MM-DD",
  expiresAt: "YYYY-MM-DD",
  sourceUrl: "https://...",
  verifiedAt: "YYYY-MM-DD"
}
```

Le pipeline doit refuser les EAN invalides ou non traçables à une source.


## Résolution automatique Open Food Facts

Le moteur peut relever un `eanSuggestion` validé par checksum et référencé dans Open Food Facts. Il **ne transforme jamais cette suggestion en `eans` exacts** : la source communautaire identifie le produit mais ne démontre pas que l'enseigne le propose dans une promotion. Seule une fiche catalogue ou produit du distributeur, reliant explicitement la promotion à cette variante, permet d'enrichir le registre exact.

Une recherche OFF dont les résultats sont paginés n'est pas considérée comme exhaustive. Une marque absente ou une correspondance de nom seule ne suffit pas à établir la référence officielle.
