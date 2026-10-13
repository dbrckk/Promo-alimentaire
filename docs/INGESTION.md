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

## Carte fidélité : protection contre les remises importées non prouvées (11 octobre 2026)

Une propriété `autoStackWhenEligible: true` livrée par un catalogue externe ne suffit **pas** à autoriser une réduction automatique quand l'utilisateur sélectionne une carte Club/PASS ou E.Leclerc. Ce drapeau était susceptible de réactiver `autoStack` dans `resolveOffersForLoyalty`, alors que la normalisation de l'import l'avait refusé faute d'EAN, de preuve commerçant, de validation magasin ou d'autres conditions.

L'import neutralise donc systématiquement `autoStackWhenEligible` pour les offres reçues de tiers. Une remise traçable par bon d'achat de paiement peut conserver le chemin `autoStack` déjà contrôlé par `trustedImportedGiftCard` ; les promotions de fidélité non prouvées demeurent candidates. Les règles intégrées et explicitement conçues par l'application, non issues du JSON fournisseur, ne sont pas changées.

Le parcours navigateur Android valide un produit exact et une fausse remise de panier à 90 % : l'achat avec carte fidélité ne doit déduire **aucun** montant garanti. Il confirme également qu'un bon d'achat traçable de 4 % reste utilisable.

## Quand une source ne peut pas être reconfirmée

Une tentative de synchronisation `unavailable` ou `partial` postérieure à `verifiedAt` ne constitue pas une preuve d'expiration immédiate, mais **annule toute garantie de cumul automatique dépendant de cette preuve**. Le chargeur garde l'offre datée comme candidate jusqu'à la révision/expiration déjà prévue. Il expose une alerte `sourceSyncWarning` et force `autoStack: false` et `autoStackWhenEligible: false` ; la fiche indique clairement « Source non reconfirmée ».

Les tentatives enregistrées **avant** la vérification de l'offre ou datées du futur ne doivent pas invalider des données prouvées postérieurement. Les événements d'échec ne modifient jamais `verifiedAt`, `reviewAfter` ou les pourcentages d'origine. Aucune donnée de remplacement n'est inventée.

### Cohérence entre diagnostic de source et preuve active (12 octobre 2026)

L'état « Source non actualisée » est désormais affiché pour un lot **actif** uniquement lorsqu'au moins une de ses offres reçoit réellement `sourceSyncWarning` après un contrôle `partial` ou `unavailable`. Un ancien échec enregistré **avant** une nouvelle preuve produit ne doit pas déclasser tout le lot : l'alerte globale suit la même chronologie que les fiches. Une date `checkedAt` dans le futur est ignorée tant qu'elle ne peut pas constituer un constat.

Pour les lots déjà expirés ou en erreur de structure, le diagnostic historique reste visible sans prolonger la date de révision. Pour les lots actifs réellement touchés par un échec ultérieur, la protection reste inchangée : `autoStack:false`, `autoStackWhenEligible:false`, aucune économie fictive. Le test Chrome Android contrôle ces trois scénarios sur le chargeur réel.

### Résilience réseau du chargement PWA — 11/10/2026

Le manifeste validé a un timeout natif de 8 s, les trois diagnostics facultatifs de 5 s, et chaque fichier d'offres de 9 s. Maximum trois chargements de lots sont simultanés. Les réponses sont **traitées dans l'ordre du manifeste**, indépendant de la fin des téléchargements, afin de préserver l'attribution des identifiants dupliqués, les statistiques et la priorité des diagnostics fournisseur. Une erreur de téléchargement affecte le fichier concerné, pas les fichiers valides déjà chargés. Tous les gains restent soumis aux contrôles de date et de provenance.


## Preuve en magasin : limites de date (12 octobre 2026)

`src/local-verification.js` s'aligne sur `isOfferActive()` pour les règles de validité des imports : `startsAt`, `verifiedAt`, `reviewAfter`, `expiresAt` et la fenêtre prudente Shopmium. Un `YYYY-MM-DD` désigne le **jour civil Europe/Paris entier** ; `validUntil` est borné à sa dernière milliseconde, y compris les 23/25 heures des jours de changement d'heure. Une échéance explicitement horodatée conserve sa valeur exacte. La durée maximale reste sept jours après confirmation.

Une ancienne preuve sauvegardée avec une échéance à minuit UTC ne suffit pas à réactiver une remise : le filtre `isOfferActive()` est appliqué à chaque utilisation et toute offre expirée est rejetée. Aucune preuve locale ne s'applique aux canaux Drive/livraison. Les assertions sont intégrées au parcours fonctionnel Android, sans ajouter de fichier de tests unitaires.

## Tableau de fraîcheur des sources : échéances civiles Paris (12 octobre 2026)

Le panneau « État des données importées » prend désormais ses échéances parmi **les offres réellement actives**, puis retient l'échéance la plus proche entre `reviewAfter`, `expiresAt` et la limite prudente Shopmium. Pour une date `YYYY-MM-DD`, la fin correspond à **23:59:59.999 Europe/Paris**, y compris les journées de 23 ou 25 heures. Pour une date horodatée, l'instant reste strictement inchangé mais le jour affiché est le **jour français** de cet instant.

Le champ `daysUntil` compare les **dates civiles en France**, sans diviser une durée par 24 heures. Les dates et alertes ne prolongent aucun rabais : `isOfferActive` reste l'autorité de validité et exclut les offres déjà expirées de la liste des échéances futures. Le même convertisseur `endOfOffer` est utilisé par la confirmation en magasin et le panneau de fraîcheur.

## Relevés personnels : date française et durée de conservation (12 octobre 2026)

`normalizeManualPrice`, `loadManualPrices` et les comparaisons provenant du téléphone utilisent désormais `parisCivilDay()` : pour les champs `YYYY-MM-DD`, « aujourd'hui » est celui de **Europe/Paris** et non le fuseau choisi sur Android ou celui du runner GitHub. L'âge limite de **30 jours** est calculé à partir des dates civiles à midi UTC, uniquement comme arithmétique de calendrier ; il n'utilise jamais la différence en heures depuis 12h UTC le jour du relevé.

Un relevé saisi il y a exactement trente dates civiles est accepté jusqu'à la fin de sa journée française, même si un changement d'heure s'est produit. À trente-et-un jours ou si la date est future ou impossible, il est rejeté. Les contrôles d'âge sont également répétés au chargement local. L'interface calibre le maximum du sélecteur sur la date française et le réactualise à la prise de focus ou lors de l'enregistrement après une utilisation prolongée de la PWA. Les observations manuelles conservent leur statut indicatif et ne débloquent aucun gain garanti.

## Rapport CI de fraîcheur : même calendrier et mêmes incidents que la PWA (12 octobre 2026)

`src/import-loader.js` expose `sourceDeadlineSummary` et `failedRefreshWarning`. Le contrôle `scripts/check-import-freshness.mjs` applique les deux fonctions, pour éviter les divergences entre la page mobile et la synthèse GitHub Actions. Seuls les documents encore actifs participent à l'échéance suivante : toute revue passée invalide l'offre même si sa date publicitaire de fin reste éloignée. `YYYY-MM-DD` expire à minuit **Europe/Paris**, le seuil des trois jours est civil, les horodatages conservent l'instant exact, et la fenêtre de prudence Shopmium fait foi. Un échec de synchronisation antérieur à une nouvelle preuve d'offre ou daté dans le futur ne produit pas d'alerte de source actuelle.

L'annuaire renvoie directement à `https://www.carrefour.fr/offres-du-moment` lorsque le flux historique de promotions Carrefour n'est pas renouvelable. Ce lien confirme uniquement **l'existence d'une page officielle de campagnes à consulter**. Il ne modifie aucune donnée d'offre, aucune déduction de panier et ne contourne aucun refus de lecture automatique des fiches produits.

## Qualité du catalogue par source : impact d'un échec récent

La fonction partagée `sourceRefreshImpact` (dans `src/import-loader.js`) compte uniquement les **offres actives** dont la preuve est **antérieure** à un échec de synchronisation survenu au plus tard lors du contrôle. Elle retourne `affectedCount`, `unaffectedCount` et les fournisseurs concernés. Le panneau de santé de la PWA expose `syncAffectedCount`. Le contrôle GitHub `scripts/check-import-freshness.mjs` indique alors `sync-warning`, même lorsqu'une date de révision future existe, et produit une annotation visible dans Actions. Il conserve `review-soon` pour les sources sans échec mais proches de leur échéance et `stale` pour les lots périmés.

**Interprétation :** « active » signifie fiche datée encore consultable, **pas** cashback acquis. Une fiche sous alerte demeure un candidat à vérifier manuellement ; son `autoStack` est désactivé. Une synchronisation impossible ne doit ni masquer des preuves plus récentes ni réactiver des campagnes mortes. La CI non stricte signale ces anomalies sans bloquer le déploiement d'autres fournisseurs valides.

## Filtrage de l'annuaire par enseigne (12 octobre 2026)

L'annuaire des sources découvertes applique `filterDiscoveryProviders(providers, {scope, search, store})`. Il respecte la sélection `carrefour`/`leclerc` du parcours de courses. Une source avec `stores: ["carrefour"]` ne doit pas être suggérée à E.Leclerc, et l'inverse est vrai. Les sources sans enseigne (`stores: []`) restent visibles dans les deux cas : dons, solidarité, anti-gaspillage ou services indépendants, sans être assimilées à une promotion de l'enseigne. `stores: ["carrefour", "leclerc"]` et `stores: ["all"]` gardent leur portée multi-enseignes.

Les appels externes et conditions propres à chaque service ne sont **pas vérifiés** par ce simple filtrage : les remises restent non garanties et aucun gain supplémentaire n'est appliqué au panier. Les parcours Android vérifient le changement de filtre dans les deux sens, tout en conservant les sources indépendantes.

## Historique Open Prices : jours calendaires français

Dans `src/product-history.js`, la validation des dates utilise `parsePriceEvidenceDate` partagé avec `src/open-data.js`. Une date de ticket `YYYY-MM-DD` correspond au **minuit de ce jour en Europe/Paris**, pas au minuit UTC. L'historique accepte donc correctement une observation du jour entre 00 h 00 et 01/02 h 00 en France, indépendamment du passage heure d'été/hiver. `productPriceTrend` regroupe les observations du même jour civil et d'un même magasin identifié avant de calculer une baisse ; `detectPriceDrops` applique le seuil de fraîcheur sur le même instant validé. Les jours impossibles et les timestamps invalides ne deviennent pas des observations locales utilisables.


## Archives historiques explicites dans la supervision quotidienne (12 octobre 2026)

Le manifeste `data/import/index.json` peut désormais déclarer `archivedOnly`, un objet associant des noms de fichiers d'import **déjà déclarés** à une justification rédigée (1–240 caractères). Le validateur refuse les exceptions hors manifeste, les justifications vides et les types invalides. Cette métadonnée sert uniquement à la **supervision** : elle ne réactive aucune fiche, ne modifie pas une échéance et ne crée aucune réduction.

La commande `npm run check:freshness -- --strict` distingue :
- `archived` : **aucune offre active** dans une archive volontairement conservée, et un avertissement reste affiché, sans bloquer la surveillance des autres fournisseurs ;
- `stale` : absence inattendue d'offres dans un fichier normal, **erreur bloquante** en mode strict ;
- `archive-active` : un fichier marqué historique contient de nouvelles offres actives ; retrait explicite de l'exception requis, **erreur bloquante** en mode strict ;
- `missing-or-invalid` / `invalid` : un fichier absent ou illisible reste **bloquant**, y compris s'il est déclaré historique.

Actuellement, seul `carrefour-promotions-auto.json` est archivé explicitement : ses **11 campagnes périmées** subsistent pour audit, sans promotion Carrefour reconfirmée. Le dernier échec du contrôle strict du 12 octobre venait uniquement de ces campagnes anciennes. Les sources Coupon Network, Shopmium et Leclerc continuent à être contrôlées normalement. Le suivi doit toujours retrouver une source Carrefour exploitable ; une archive n'en remplace pas une.

## Sélection quotidienne, sans transformer les publicités en prix (12 octobre 2026)

Le module `src/daily-catalogue.js` consomme les lots normalisés et `filterActiveOffers` ; les campagnes `data/daily-campaigns.json` sont une deuxième catégorie strictement **éditoriale**, jamais déclarée dans `data/import/index.json`. Le navigateur applique chaque fois la date `Europe/Paris`, le canal et l'enseigne. Les annonces doivent porter une date de consultation valide, une date de fin officielle et un lien HTTPS appartenant au domaine de l'enseigne ; sans ces preuves, elles sont rejetées. Elles conservent leurs plafonds uniquement dans les textes publicitaires et **n'ont pas** de taux global, de prix SKU, de code GTIN ni de gain panier produit.

Les recommandations de fiches enseigne classent d'abord les EAN ayant leur preuve, puis les taux documentés, puis les montants. Toutes restent des candidates à confirmer en magasin, et les ODR sont présentées indépendamment : aucune addition de gains non cumulables. Les campagnes non renouvelées disparaissent automatiquement à leur échéance ; le catalogue officiel reste accessible.

## Sélection quotidienne : candidats catalogue non reconfirmés (14 octobre 2026)

Le sélecteur `selectDailyCatalogue` sépare désormais trois ensembles sans les additionner : `retailer` (enseigne sans alerte de revalidation), `extra` (coupons/remboursements non impactés), et `unconfirmed` (anciens candidats **enseigne**, strictement pour vérification manuelle). `unconfirmed` n'est jamais intégré à `highlights`, `affordableCandidates`, ni aux remises panier. Ses propriétés de prix courant (`savingAmount`, `savingPercent`, `basePrice`, `upfrontCost`) valent `null` ; seules des propriétés nommées `historical*` exposent l'ancienne annonce. L'UI la date explicitement et affiche un lien officiel. La liste exclut les anciens produits après la borne d'activité d'origine et les autres magasins/canaux. Un filtre budget masque entièrement cette section, plutôt que de traiter un ancien prix comme une dépense actuelle possible. Les statuts de synchronisation non confirmés ne deviennent jamais des preuves de prix.
