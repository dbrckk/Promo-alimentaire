# Promo Alimentaire

PWA mobile-first pour regrouper et comparer les économies disponibles chez **Carrefour** et **E.Leclerc** : promotions, cashback, offres de remboursement (ODR), coupons, bons d'achat remisés et prix observés.

## État

Fonctionnalités actuelles :
- choix Carrefour / E.Leclerc ;
- filtre de canal d’achat : Magasin / Drive / En ligne ;
- tri par pourcentage d'économie, économie en euros ou fraîcheur ;
- recherche d'offres ;
- chargement runtime de snapshots publics validés (Shopmium, La Belle Adresse, Coupon Network et Envie de Plus au 07/10/2026) avec expiration automatique ;
- contrôle quotidien de fraîcheur des snapshots via GitHub Actions, avec signalement des sources devenues entièrement obsolètes ;
- sync Shopmium public planifié deux fois par semaine avec extraction des dates, paliers et références éligibles ;
- sync La Belle Adresse planifié deux fois par semaine, avec revalidation forcée à 7 jours lorsqu'aucune date de fin publique n'est fournie ;
- synchronisation Coupon Network deux fois par semaine depuis la page publique, avec seuil minimal d'extraction et validation complète avant remplacement du snapshot ;
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
- recommandation explicite du meilleur moyen de paiement remisé, avec alternatives et économie estimée ;
- plan d’action ordonné avant / paiement / en caisse / après achat pour ne pas rater une activation ou une ODR ;
- liste de courses persistante sur l'appareil avec quantités ;
- actualisation des mêmes références chez Carrefour et E.Leclerc ;
- comparaison des deux paniers avec refus de déclarer un gagnant si la couverture prix est incomplète ;
- ventilation des économies par levier : produit exact, paiement remisé, autres garanties, ODR candidates et bundles ;
- regroupement des prix par point de vente physique pour éviter de mélanger plusieurs magasins d'une même enseigne ;
- préférence automatique pour les prix ≤30 jours, avec repli jusqu'à 120 jours seulement si nécessaire ;
- meilleur cas prudent qui ne double-compte pas les ODR produit et bundles potentiellement incompatibles ;
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
- `src/adapters/coupon-network.js` : extraction prudente des remboursements publics Coupon Network.
- `scripts/sync-coupon-network.mjs` : synchronisation fail-safe du snapshot Coupon Network.
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

Test manuel du connecteur Coupon Network sans écriture :

```bash
npm run sync:coupon-network
```

## Priorités suivantes

1. Alimenter les offres avec des EAN/GTIN **vérifiés par la source** afin de faire passer les candidats en correspondances exactes.
2. Enrichir l'historique avec l'évolution **par produit** quand plusieurs observations existent.
3. Ajouter des alertes locales sur baisse de prix / nouvelle ODR après ingestion fiable.
4. Ajouter des connecteurs d'ingestion autorisés pour les catalogues et offres.
5. Déployer la PWA en HTTPS pour test Android réel.

Voir `docs/SOURCES.md` pour la stratégie d'intégration, `docs/MATCHING.md` pour le rapprochement produit/offre et `docs/INGESTION.md` pour le pipeline EAN vérifié.


### Limite La Belle Adresse

La Belle Adresse charge actuellement ses remboursements via une API membre protégée. Le projet ne contourne pas cette authentification. La synchronisation tente uniquement les pages publiques ; si elles ne contiennent pas les cartes, elle conserve le dernier snapshot manuel vérifié au lieu d'échouer ou d'inventer des offres.



### Taux de paiement

Les taux publics Carrefour de Fidme, Widilo, eBuyClub et Poulpeo, ainsi que le cashback connecté eBuyClub Carrefour/E.Leclerc, disposent désormais d'un snapshot dédié et d'une synchronisation quotidienne. Les valeurs importées remplacent les taux statiques équivalents sans créer de doublons.



### Canaux et cashbacks web

Le canal sélectionné filtre désormais toutes les offres compatibles :

- **Magasin** : cartes cadeaux, cashback carte, ODR magasin compatibles ;
- **Drive** : uniquement les offres qui déclarent ce canal ou qui sont valables tous canaux ;
- **En ligne** : cashbacks d'affiliation et offres web.

Les cashbacks web eBuyClub actuels sont chargés comme **potentiels non garantis** : Carrefour jusqu'à 3 € et E.Leclerc jusqu'à 2,5 % au 7 octobre 2026. Joko et iGraal sont traités comme sources dynamiques à vérifier juste avant la commande quand aucun taux public fiable n'est disponible.

Open Prices reste une source de prix observés dans des magasins physiques : en Drive / En ligne, l'application affiche ces prix comme indicatifs et ne déclare jamais un gagnant Carrefour/E.Leclerc sur cette seule base.



## Promotions enseigne et niveau de preuve

Les promotions Carrefour/E.Leclerc suivent désormais une chaîne de preuve stricte :

1. **Candidat heuristique** — marque/nom compatibles mais référence exacte inconnue.
2. **EAN exact** — la promotion est reliée à un GTIN précis avec une preuve produit.
3. **Magasin confirmé** — l'utilisateur confirme localement avoir vérifié cette promo dans le point de vente physique affiché.
4. **Fidélité confirmée** — quand une carte est requise, le profil local doit indiquer Club/PASS/Carte E.Leclerc.
5. **Garantie calculable** — seulement lorsque toutes les preuves requises sont réunies.

La confirmation magasin est stockée uniquement sur l'appareil, liée au couple offre + magasin, et expire au plus tard avec l'offre ou après 7 jours.

Les mécaniques multi-achats sont calculées à partir de leur formule exacte. Par exemple, `-68 % sur le 2e` n'est pas appliqué comme `-34 %` sur une quantité impaire ; `2+1 offert` ne compte qu'un article gratuit par groupe complet de trois.

### Résolution EAN

Un workflow séparé cherche les GTIN manquants via Open Food Facts. Il reste volontairement conservateur :

- recherche espacée pour respecter les limites du service ;
- retry/backoff sur HTTP 429/503 ;
- marque et termes produit obligatoires ;
- seuil de score ;
- marge minimale sur le second candidat ;
- une offre générique avec plusieurs produits plausibles reste ambiguë.

Aucun EAN n'est écrit lorsqu'une ambiguïté subsiste.


### Fiabilité des validations locales et des alertes prix

Une confirmation locale ne s'applique qu'à l'offre exacte et au même point de vente. Elle devient invalide si changent l'EAN, les canaux, les exclusions, les conditions de cumul, le montant, la formule ou la prochaine date de révision. Une confirmation expirée ne peut pas être prolongée localement sans nouvelle vérification. Vérifier le magasin ne valide **pas** à lui seul un prix Drive / livraison dont la source exige une confirmation spécifique.

Les alertes de baisse comparent uniquement deux observations à des **dates différentes dans un même magasin physique identifié** (identifiant magasin, ou nom et code postal). Deux magasins distincts d'une même enseigne ne peuvent pas produire une fausse baisse. Un prix sans magasin suffisamment identifié n'alimente pas les alertes. Les contrôles sont locaux et ne tournent pas en arrière-plan.


### Garde-fous supplémentaires (octobre 2026)

- Une offre importée ne peut être automatiquement cumulable au niveau produit que si sa référence GTIN valide dispose d'une source EAN HTTPS, et si aucune confirmation magasin/prix spécifique n'est encore requise. Les données non prouvées restent candidates.
- Le niveau de preuve exige une **correspondance entre le GTIN du produit et celui de l'offre** : le simple fait de contenir une liste d'EAN ne prouve rien concernant le produit scanné.
- Les snapshots mal formés sont rejetés, tandis que les taux paiement importés remplacent leur fallback statique équivalent sans multiplier les cartes identiques.
- Les taux paiement statiques expirent eux aussi après leur prochaine révision si les sources automatiques sont indisponibles.
- Les offres expirées ou dont la date de révision est dépassée sont retirées du calcul **à chaque interaction**, même si la PWA reste ouverte.
- Les économies de produit et de bundle candidates sont distinguées entre **valeur brute** et **gain supplémentaire après les remises déjà retenues** ; elles ne sont jamais soustraites deux fois.
- Un bundle dont un article obligatoire n'a pas de prix exploitable n'est pas chiffré.
- L'ordre d'action suit systématiquement les étapes avant achat, paiement, carte fidélité en caisse, preuve d'achat, puis demandes ODR.
- Sur la fiche produit, le lien de preuve EAN et le lien de l'offre sont distincts : une référence exacte ne garantit pas à elle seule l'application de la promotion.

Ces vérifications sont **conservatrices** et ne remplacent pas la vérification des conditions, du stock, du point de vente et du ticket final.


### Contrat de qualité PWA Android

`npm run verify` contrôle aussi que :

- les identifiants HTML utilisés par l'application existent et ne sont pas dupliqués ;
- toutes les dépendances JavaScript transitives de `src/app.js` sont disponibles ;
- ces modules figurent dans le cache du service worker pour le fonctionnement hors ligne.

Les scénarios de panier signalent désormais les **vérifications les plus rentables** par gain additionnel potentiel, sans additionner les offres incertaines ni les présenter comme garanties.


### Cohérence historique, localisation et cache Android

Les comparaisons de coût ne produisent une tendance que pour un **panier identique** (mêmes codes produits et quantités), le **même magasin physique**, le **même canal** et le **même rayon de proximité**. Un changement de panier, de magasin ou de zone ne sera plus présenté comme une hausse ou une baisse de prix. Les anciennes entrées sans identité de comparaison fiable ne créent pas de tendance.

Pour les prix Open Prices :

- les coordonnées absentes restent absentes : elles ne sont jamais converties en point fictif `(0, 0)` ;
- les données sont contrôlées côté client (EAN du produit, devise EUR, prix strictement positif et enseigne non ambiguë) ;
- en mode « Autour de moi », les observations sans géolocalisation valide ou hors rayon sont exclues même si l'API les a renvoyées ;
- un simple nom d'enseigne ne suffit pas à agréger des références dans un panier attribué à un magasin précis ;
- un prix inférieur à un prix normal/barré fourni par la source est identifié comme déjà remisé, même si le drapeau de promotion manque.

Le panier distingue maintenant **montant estimé payé en caisse**, **cagnotte fidélité**, **remboursements différés** et **coût économique après avantages**. Les remboursements différés ne réduisent pas artificiellement le besoin de trésorerie en caisse.

Le service worker de la PWA :

- met à jour les clients lorsqu'une nouvelle version vérifiée est disponible ;
- ne remplace pas le cache fonctionnel par une réponse HTTP en erreur ;
- conserve hors ligne les modules validés ;
- ne supprime que les anciens caches propres à `promo-alimentaire-`, sans toucher aux caches d'autres applications partageant le même domaine.

Toutes ces règles disposent de tests exécutés dans `npm run verify`.
