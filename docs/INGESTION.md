# Pipeline d'ingestion

## Objectif

Transformer des offres externes vérifiables en données normalisées sans diminuer la fiabilité du moteur de comparaison.

## Flux

```text
source autorisée
    ↓
snapshot JSON
    ↓
validation structurelle
    ↓
checksum GTIN
    ↓
preuve EAN
    ↓
dates / enseignes / remise
    ↓
déduplication
    ↓
revue
    ↓
registre d'offres
```

## Niveaux de confiance

- **EAN exact traçable** : code GTIN valide + `eanEvidenceUrl`.
- **Correspondance heuristique** : marque/nom seulement ; affichée comme candidate et jamais incluse automatiquement dans le gain garanti.
- **Offre panier** : pas d'EAN nécessaire, mais les règles de cumul doivent être modélisées séparément.

## Sécurité des cumuls

Le pipeline d'ingestion ne doit pas mettre `autoStack: true` simplement parce qu'une remise existe. Ce champ n'est utilisé que lorsque le mécanisme et ses incompatibilités sont suffisamment établis.

## Sources

Privilégier :

1. API officielles ;
2. flux partenaires/affiliation autorisés ;
3. pages publiques officielles ;
4. données ouvertes ;
5. saisie manuelle avec URL de preuve.

Ne pas utiliser d'endpoints privés d'applications mobiles ni contourner authentification ou protections anti-bot.

## GTIN stricts — 11 octobre 2026

Le validateur GS1 ne conserve plus silencieusement les seuls chiffres d'une référence corrompue. Seuls les séparateurs visuels (espaces et tirets) sont tolérés ; toute lettre ou autre ponctuation rend le GTIN invalide avant le contrôle de checksum. Cette contrainte protège les imports, les sauvegardes et les correspondances EAN exactes contre les fausses identités produit.

Les API Open Food Facts / Open Prices ne sont pas appelées si le checksum du code-barres recherché est invalide. Le parcours Android vérifie le rejet et l'absence de requête dans cette situation.

## Quand une source ne peut pas être reconfirmée

Une tentative de synchronisation `unavailable` ou `partial` postérieure à `verifiedAt` ne constitue pas une preuve d'expiration immédiate, mais **annule toute garantie de cumul automatique dépendant de cette preuve**. Le chargeur garde l'offre datée comme candidate jusqu'à la révision/expiration déjà prévue. Il expose une alerte `sourceSyncWarning` et force `autoStack: false` et `autoStackWhenEligible: false` ; la fiche indique clairement « Source non reconfirmée ».

Les tentatives enregistrées **avant** la vérification de l'offre ou datées du futur ne doivent pas invalider des données prouvées postérieurement. Les événements d'échec ne modifient jamais `verifiedAt`, `reviewAfter` ou les pourcentages d'origine. Aucune donnée de remplacement n'est inventée.
