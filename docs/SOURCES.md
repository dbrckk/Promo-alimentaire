# Sources et stratégie d'intégration

Dernière revue : 2026-10-12.

## Sécurité des économies fidélité Carrefour — revue du 11 octobre 2026

Source : [conditions PASS officielles](https://www.carrefour.fr/services/carte-pass), [FAQ Avantages Club](https://www.carrefour.fr/faq?question=est-ce-les-primes-fidelite), [activation dans l'application](https://www.carrefour.fr/faq?question=comment-puis-je-adherer-primes-fidelite).

L'activation explicite des avantages Club est requise. La carte PASS doit être rattachée au Club et utilisée pour le paiement afin d'obtenir les 15 % concernés. La réduction est **créditée en cagnotte**, ne se cumule pas automatiquement avec d'autres promotions, et exclut plusieurs catégories ou références, dont certains produits à 0,99 € ou 1,29 €, lots, fruits/légumes secs, conserves et surgelés. Le simple champ « je possède une carte » ne justifie donc **jamais** un gain en euros garanti.

Une catégorie/une marque Open Food Facts ne prouve pas un EAN éligible chez le commerçant : les avantages générés sont des **candidats heuristiques** sans `eans` fabriqués ni `autoStack`. Ils ne sont plus calculés après la date de révision tant que la source n'est pas reverifiée. Toute autre campagne expirée est également filtrée dans le moteur panier, même si l'appelant a oublié le filtrage de l'interface.

## Parcours officiel selon le canal et preuve Carrefour — 12 octobre 2026

La [FAQ Carrefour](https://www.carrefour.fr/faq?question=drive-pourquoi-existe-t-il-difference-entre-promotions-magasin-celle-drive) précise que promotions Drive et magasin peuvent différer selon l'assortiment et la politique locale. La [FAQ E.Leclerc](https://faq.e.leclerc/hc/fr/articles/360014892877-Comment-consulter-le-catalogue-et-les-promotions-E-Leclerc) renvoie séparément à ses prospectus et à `www.leclercdrive.fr`.

**Lorsque la source est obsolète ou non reconfirmée**, la page mobile État des données ouvre les catalogues `/catalogue` et `e.leclerc/prospectus` pour le magasin, mais `carrefour.fr/promotions` et `leclercdrive.fr` pour le Drive/la livraison. Ce sont des pages de **consultation manuelle**, sans extraction de prix ni réduction ajoutée au panier.

Le vérificateur Carrefour exige désormais : URL officielle portant l'EAN, titre `h1` identifiant la marque et la référence attendues, trois champs numériques (prix promo, prix barré et taux), paire de prix liée et pourcentage cohérent sur la page. Une simple réponse HTTP 200, des recommandations hors produit ou des métadonnées tarifaires incomplètes ne peuvent plus prolonger une promotion.


## Régression de synchronisation E.Leclerc — 13 octobre 2026

L'exécution quotidienne `Verify E.Leclerc catalogue` avait échoué après reconfirmation de fiches : une assertion de CI attendait **exactement** `verifiedAt = 2026-10-12`, alors qu'une vérification ultérieure autorisée écrivait `2026-10-13`. Ce décalage est un défaut de scénario de test, **pas une preuve que le commerçant a confirmé une nouvelle promotion**.

Les contrôles d'intégration existants vérifient désormais la date de preuve contre la première date documentée du catalogue, la date courante et l'expiration réelle de la campagne ; ils n'exigent plus que la preuve reste éternellement datée du jour d'import initial. Le scénario de comparaison panier/budget du prospectus est exécuté à **la plus récente date de preuve effectivement présente dans les huit fiches vérifiées**, pas à une date fixe qui serait antérieure à une future revalidation légitime. La limite de fin de campagne reste celle d'origine.

La commande `scripts/check-import-freshness.mjs --strict` reste inchangée **en production** : elle échoue toujours pour un lot manquant, invalide ou périmé hors archive explicitement documentée. Son scénario de régression utilise un répertoire JSON temporaire isolé quand `NODE_ENV=test` et `PROMO_FRESHNESS_FIXTURE_DIR` sont fournis ensemble. Ainsi les renouvellements Shopmium et Coupon Network ne changent pas artificiellement les assertions sur un ancien instant d'essai ; le test confirme également qu'une archive contenant une offre active est refusée en mode strict.


## Incident de synchronisation constaté le 10 octobre 2026

La vérification des journaux GitHub Actions établit deux défaillances différentes :

- **Carrefour** : les onze pages produit contrôlées ont répondu `HTTP 403` depuis le runner GitHub. Il s'agit d'un refus d'accès, pas d'une confirmation négative du prix. Le synchroniseur s'arrête désormais au premier 401/403 pour éviter les sollicitations répétées ; il ne contourne ni l'authentification ni les protections du site.
- **E.Leclerc** : les quatre pages de catalogue testées ont répondu, mais leur HTML récupéré ne contenait ni les libellés exacts ni les pourcentages/mécaniques des cinq offres attendues. Une page techniquement accessible ne constitue **pas** une preuve de promotion active. Le contenu peut dépendre d'un rendu dynamique.
- **Coupon Network** : le lien historique `index.rss` est indisponible (404 observé). Les fiches visibles dans une application rendue par JavaScript ne peuvent pas être assimilées à des preuves présentes dans le HTML brut accessible au synchroniseur.

**Comportement après correction :** les campagnes dont la révision ou la date de fin est dépassée ne sont plus interrogées ni reconfirmées. Les snapshots archivés restent en place, mais leurs offres périmées sont masquées par l'application. La dernière tentative d'accès reste consignée dans les diagnostics sans prolongation des dates.

**Chemins d'intégration conformes :** rechercher des API/flux de catalogue **publics ou officiellement autorisés**, obtenir un accord de données/partenariat, ou importer manuellement des offres possédant URL de source, preuve d'éligibilité exacte, magasin, prix, réduction et échéance. Ne pas traiter un HTTP 200 d'un simple squelette HTML comme une revalidation. Ne pas utiliser d'API privées ou de contournement anti-bot.

Les workflows de synchronisation possédant la permission `contents: write` restreignent les déclenchements `push` à `main` et exécutent leurs jobs d'écriture uniquement lorsque `github.ref == 'refs/heads/main'`. Cela inclut un déclenchement manuel (`workflow_dispatch`) sélectionnant une autre branche : aucune publication en production n'est autorisée depuis ce contexte.

## Nouvelle voie publique Coupon Network — 11 octobre 2026

La page officielle [prod-cn-offers.couponnetwork.fr](https://prod-cn-offers.couponnetwork.fr/) présente un catalogue public de remboursements avec titres, descriptions, montant en euros et action « Activer l'offre ». Une version indexée du contenu comporte environ 126 offres, mais le chargement HTML non exécuté peut aussi produire un catalogue vide. **Le nombre n'est ni un engagement de disponibilité, ni une preuve que le runner GitHub peut lire ces fiches.**

Le synchroniseur tente désormais cette page **sans connexion ni endpoint privé**, avant la page principale et l'ancien RSS. Si son HTML initial ne révèle rien, le job GitHub Actions utilise **Chromium/Playwright open source** pour consulter seulement la page publique normalement visible à un visiteur, sans identifiant, endpoint privé, contournement ou imitation anti-bot. Un second analyseur reconnaît uniquement la séquence **titre + condition d'achat + montant + mention remboursé + bouton d'activation**. Une publicité indiquant « jusqu'à 409 € » ne devient pas une offre et un squelette de page sans cartes ne réactualise aucun remboursement.

Les offres extraites sont des **candidats de remboursement différé**, jamais des gains en caisse garantis : pas d'EAN exact inventé, pas de cumul automatique, référence et conditions toujours à vérifier avant achat. Les sauvegardes ne sont remplacées que si le nombre et la validité des nouvelles fiches passent les seuils existants ; une chute anormale conserve l'ancien snapshot et ses échéances sans les prolonger.

La CI valide les modules et un scénario navigateur Android vérifie la forme de carte réellement publiée, un montant isolé non éligible, et le cas d'un site dynamique retournant zéro offre. Il faut contrôler les journaux du prochain workflow GitHub Actions exécuté sur `main` pour conclure si l'extraction fonctionne **avec les réponses réseau réellement servies au runner**.

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


## La Belle Adresse — mode dégradé sûr

Au 7 octobre 2026, les pages publiques de remboursement sont rendues côté client et le backend de cashback répond avec une permission membre requise. Le synchroniseur :

1. tente uniquement les pages publiques ;
2. n'utilise aucun endpoint privé avec contournement d'authentification ;
3. conserve le dernier snapshot manuel vérifié quand l'extraction publique est insuffisante ;
4. laisse le contrôle de fraîcheur signaler quand ce snapshot doit être revu.



## Synchronisation des moyens de paiement

Le projet synchronise quotidiennement les taux publics utiles au panier :

- Fidme — bon d'achat Carrefour ;
- Widilo — carte cadeau Carrefour ;
- eBuyClub — carte cadeau Carrefour ;
- Poulpeo — bon d'achat Carrefour ;
- eBuyClub — cashback connecté Carrefour et E.Leclerc.

Les snapshots importés remplacent automatiquement la valeur statique du même couple fournisseur/mécanisme/enseigne. Plusieurs cartes cadeaux ne sont jamais additionnées entre elles : le moteur choisit uniquement la meilleure offre du groupe `payment-discount`.

## Garanti vs potentiel

L'interface distingue explicitement :

- **garanti** : uniquement les remises que le moteur considère suffisamment sûres et compatibles ;
- **potentiel produit** : meilleure ODR candidate par ligne, sans cumul automatique ;
- **potentiel bundle** : offre multi-produits détectée mais non garantie ;
- **meilleur cas prudent** : coût estimé après la plus forte économie candidate, sans additionner artificiellement produit + bundle quand leur compatibilité n'est pas établie.



## Concurrence entre portails cashback

Pour les achats en ligne, plusieurs services peuvent proposer simultanément une redirection ou une extension cashback. L'application ne les additionne jamais automatiquement.

Règles :

1. comparer les taux disponibles juste avant la commande ;
2. choisir **un seul** chemin d'affiliation principal ;
3. éviter d'activer plusieurs extensions cashback concurrentes ;
4. conserver les offres CB / cartes cadeaux séparées tant que leur compatibilité exacte n'est pas établie ;
5. ne compter dans le total garanti que les mécanismes explicitement marqués compatibles.

Joko et iGraal peuvent apparaître comme vérifications dynamiques dans le plan d'action même lorsqu'aucun taux public chiffrable n'est disponible.

## Canaux

- `store` : achat physique en magasin ;
- `drive` : commande Drive ;
- `online` : commande web/livraison ;
- absence de `channels` sur une offre : applicable à tous les canaux seulement lorsque la source ne distingue pas le canal.

Les prix Open Prices sont traités comme des observations magasin. Ils ne servent pas à désigner un gagnant fiable en mode Drive ou En ligne.



## Échelle de preuve des promotions enseigne

Une promotion locale n'entre dans le total garanti que si son niveau de preuve le permet :

- **heuristique** : correspondance marque/nom seulement ;
- **exact-product** : EAN/GTIN exact prouvé ;
- **store-verified** : point de vente physique explicitement confirmé localement ;
- **loyalty-verified** : carte requise déclarée disponible ;
- **verified** : toutes les conditions nécessaires sont réunies.

Les confirmations de magasin sont locales au navigateur et expirent automatiquement. Elles ne sont jamais partagées comme preuve globale pour les autres utilisateurs ou les autres magasins.

## Résolution automatique des GTIN

Le résolveur Open Food Facts utilise la recherche plein texte historique uniquement pour un petit nombre d'offres catalogue et n'accepte jamais un résultat sur la seule proximité lexicale. Un produit est promu en EAN exact seulement si le candidat est suffisamment spécifique et non ambigu.

Le workflow respecte volontairement un rythme inférieur aux limites documentées d'Open Food Facts et retente les réponses temporaires `429` / `503` avec backoff. En cas d'échec réseau, l'offre d'origine reste inchangée.

## Promotions multi-achats

Les valeurs affichées comme `2+1 offert`, `-X % sur le 2e` ou prix de lot sont représentées par une formule explicite et recalculées selon la quantité réellement présente dans le panier. Un pourcentage moyen n'est jamais extrapolé aux unités hors groupe promotionnel.


## Coupon Network — indisponibilité des pages publiques (8 octobre 2026)

Le dernier synchroniseur a reçu **0 offre exploitable** : le site public présente des offres dynamiques et le flux historique `index.rss` renvoie HTTP 404.

- Le synchroniseur ne remplace **jamais** une collection valide par une liste vide ou brutalement incomplète.
- En cas d'indisponibilité, il conserve le fichier et ses dates de vérification **inchangés** ; les offres expirent normalement à la date de révision.
- GitHub Actions émet un avertissement et un résumé indiquant explicitement « source non réactualisée ».
- Pour diagnostiquer volontairement un échec d'extraction en ligne de commande : `npm run sync:coupon-network -- --strict-source` (statut d'échec, aucune publication).
- Les offres Coupon Network doivent être **activées avant l'achat**. Les réductions magasin sur le même produit ne sont normalement pas cumulables avec le remboursement Coupon Network, contrairement à certains avantages de carte fidélité.
- Les achats Drive et livraison nécessitent une **facture**, et pas un simple bon de commande.

Conditions officielles : <https://www.couponnetwork.fr/contact-us> et <https://www.couponnetwork.fr/conditions-generales-utilisation>.

Les offres dont la source publique n'est pas vérifiable restent des opportunités à contrôler dans le service d'origine ; la date du manifeste global ne constitue pas une nouvelle preuve individuelle.


## Santé des synchronisations publiques (8 octobre 2026)

Une exécution GitHub Actions réussie **ne garantit pas** que les pages marchandes aient confirmé les promotions.

L'application distingue désormais trois informations indépendantes :

1. **Validité d'une offre** : `verifiedAt`, `reviewAfter`, `expiresAt`, EAN et magasin. Une vérification échouée ne prolonge jamais ces dates.
2. **Exécution technique** : statut du workflow Github Actions, tests unitaires et validation du snapshot.
3. **Dernière tentative de synchronisation** : nombre de promotions effectivement reconfirmées, dernière tentative et motif d'indisponibilité.

Les diagnostics sont stockés séparément pour éviter les conflits entre actions concurrentes :

- `data/import/source-sync-status.json` : Coupon Network.
- `data/import/source-sync-carrefour.json` : Carrefour.
- `data/import/source-sync-leclerc.json` : E.Leclerc.

Les fichiers de diagnostic ne sont jamais traités comme des lots d'offres. L'interface affiche « Source non actualisée » lorsque l'extraction a échoué ou reste partielle, mais ne gonfle ni le nombre d'offres garanties ni les échéances de révision.

La CI mobile vérifie que les avertissements disponibles dans les fichiers apparaissent dans l'interface et que l'application reste utilisable hors ligne.


## Couverture paginée Open Prices et unités de prix

L'API publique Open Prices (<https://openfoodfacts.github.io/documentation/docs/Open-prices/prices/prices_list/>) fournit des résultats paginés et indique le mode de facturation dans `price_per`.

- L'application consulte la première page et peut rechercher **jusqu'à deux pages par défaut**, sans aller au-delà de **trois pages** même si le serveur annonce beaucoup de résultats. Elle s'arrête dès qu'un nombre suffisant de relevés éligibles est obtenu.
- Une observation est conservée uniquement si elle correspond au **code-barres demandé**, à l'enseigne sélectionnée, à la monnaie EUR et à un montant strictement positif. La recherche locale filtre également par coordonnées réelles et rayon.
- Les relevés `price_per=KILOGRAM` ne deviennent **jamais un prix à l'unité** dans le panier. Il faut une conversion explicite fondée sur le poids réel avant d'autoriser ce type de calcul.
- Si une page supplémentaire échoue, l'application **conserve** les relevés exploitables de la première page, mais signale une **couverture partielle**. Une telle recherche ne permet pas de désigner un gagnant garanti sur le panier.
- Les enregistrements répétés sont dédupliqués par l'identifiant de relevé (ou par un identifiant composite lorsque le serveur n'en renvoie pas).
- Les frais de déplacement, de livraison et les stocks ne sont pas inclus dans un prix observé communautaire.

Une source de promotion contenant des codes EAN explicites s'applique **uniquement à ces références** : une correspondance marque/nom sur un autre code ne peut plus réintroduire l'offre en tant que suggestion potentielle. Les remises génériques sans EAN prouvé restent accessibles comme pistes heuristiques à vérifier.

### Présentation des offres avec échec de source — 11/10/2026

Une dernière synchronisation `unavailable` ou `partial`, plus récente que la preuve `verifiedAt`, ajoute `sourceSyncWarning` à chaque offre active concernée et désactive son cumul automatique. Le filtre des offres masque **par défaut** ces candidates non reconfirmées, mais un réglage explicite permet de les consulter et de vérifier les liens officiels. La date `verifiedAt`, `reviewAfter` et le taux ne sont ni prolongés ni artificiellement revalidés. Les sources dont le diagnostic manque ne deviennent pas pour autant des réductions garanties. L'audit de fraîcheur strict continue à signaler les sources totalement expirées.

### Intégrité du manifeste des sources importées

Un manifeste distant ne doit jamais pouvoir demander la lecture d'un autre chemin ou d'un autre domaine. La validation commune `src/import-manifest.js` impose un maximum de 60 noms `*.json` locaux, sans doublons, sans traversée de répertoires ni fichiers réservés aux diagnostics. CI, application et précache PWA appliquent cette restriction. Le refus bloque le lot non fiable, sans créer de fausses offres ni invalider les ressources statiques hors ligne.

## Étendre les offres alimentaires via les campagnes Shopmium — 11 octobre 2026

**Origine du défaut :** l'index officiel [offers.shopmium.com/fr](https://offers.shopmium.com/fr/) renvoie parfois à une **page marketing regroupant plusieurs offres**. Le parseur de détail refuse correctement ces pages puisqu'elles ne contiennent pas de conditions d'achat, mais l'ancien synchroniseur ne récupérait pas les liens des véritables offres enfants. Conséquence : aucune offre Bonduelle Carotte Citron / Taboulé, Barilla Al Bronzo ou certaines variantes n'entrait dans le catalogue malgré une preuve officielle publique.

**Résolution :** exploration non récursive des pages campagne contenant « Découvrir ces offres », uniquement vers des URL Shopmium HTTPS `/fr/n/...` explicitement présentes dans les liens HTML, au plus 12 par campagne et 110 pages par exécution. Les pages individuelles doivent satisfaire le parseur des remboursements, références, dates, magasins, modalités et fermeture anticipée. Le nom de marque officiellement attribué par la page prévaut sur une supposition faite à partir du titre. Un refus 401/403/429 provoque l'arrêt sans contournement. Le rechargement est quotidien.

Fiches consultées individuellement le **11/10/2026** et ajoutées au snapshot avec `verifiedAt=2026-10-11`, `reviewAfter=2026-10-15`, *sans aucun EAN fictif* :

| Offre | Économie annoncée selon les quantités | Fin des achats annoncée | Preuve |
| --- | --- | --- | --- |
| Bonduelle carottes Citron de Sicile | 25% / 30% / 34% pour 1 / 2 / 3 articles | 30/12/2026 | https://offers.shopmium.com/fr/n/carotte-citron-de-sicile-bonduelle |
| Bonduelle Taboulés | 25% / 30% / 34% pour 1 / 2 / 3 articles | 30/12/2026 | https://offers.shopmium.com/fr/n/taboule-bonduelle |
| Barilla Al Bronzo Radiatori / Spaghetti ondulati | 30% sur 1 article | 31/10/2026 | https://offers.shopmium.com/fr/n/une-accroche-de-sauce-parfaite |
| Barilla Al Bronzo autres références | 20% pour 1–2 articles, 30% pour 3 | 31/10/2026 | https://offers.shopmium.com/fr/n/barilla-al-bronzo-5 |
| Daddy cassonades et sucres | 20% sur 1, 25% sur 2 | 31/10/2026 | https://offers.shopmium.com/fr/n/a-chacun-son-daddy |

Les prix moyens affichés par Shopmium ne sont pas des prix garantis dans un Carrefour/E.Leclerc précis. Les remboursements restent soumis à l'achat des références admissibles, à la quantité, aux exclusions, à la preuve d'achat et à la disponibilité des demandes. Les offres non cumulables ne sont jamais automatiquement soustraites d'une réduction déjà appliquée. Une fiche conservée faute d'accès garde sa date de contrôle initiale ; après la date de révision elle n'est plus proposée.


## Rayons Shopmium et politique non alimentaire ≥50 % — 11 octobre 2026

Le champ public **« Au rayon … »** des fiches Shopmium est utilisé pour distinguer les produits alimentaires et les produits non alimentaires, sans fabriquer d'identifiant EAN ni confondre la vente en supermarché avec de l'alimentaire. Exemples officiels consultés : [Fruit Shoot, « Boissons pour enfants »](https://offers.shopmium.com/fr/n/boissons-fruitees-fruit-shoot), [Sanex, « Douche »](https://offers.shopmium.com/fr/n/gels-douche-sanex-derma-therapie-2), [Soupline, « Adoucissants »](https://offers.shopmium.com/fr/n/soupline-adoucissant-parfum-de-linge), [Renova, « Hygiène »](https://offers.shopmium.com/fr/n/papier-toilette-textile-4-epaisseurs).

Les catégories source qui expriment explicitement un produit hors alimentaire (entretien, hygiène, maison, non-alimentaire, etc.) sont exclues du parcours courses lorsque `effectivePercent < 50`, ou lorsque le pourcentage est **inconnu** (ex. remboursement fixe de 2 € sans prix de référence vérifié). Les offres de panier s'appliquant à l'alimentaire restent admises. Une catégorie « autre » reste non classée : elle ne doit pas être présentée comme une preuve alimentaire, et les fiches ambiguës doivent faire l'objet de vérifications futures.

Les 13 fiches déjà présentes et manifestement non alimentaires ont été étiquetées `category: "non-alimentaire"` afin de corriger immédiatement les résultats jusqu'à la prochaine synchronisation officielle, sans les supprimer de l'archive. Le filtrage est appliqué dans `src/domain.js` et `src/app.js`, et fait l'objet d'un contrôle navigateur Android sur le JSON de production.

## Revue des rayons Shopmium — 11 octobre 2026

Les fiches officielles utilisent plusieurs formulations de **rayon**, non équivalentes à un simple titre commercial :

- [Cafés Legal](https://offers.shopmium.com/fr/n/cafes-legal-capsules-compatibles-nespresso) : « Au rayon cafés capsules compatibles Nespresso » → alimentaire.
- [Régilait Yaourt Maison](https://offers.shopmium.com/fr/n/yaourt-maison-regilait) : « Au rayon Régilait ou Ferments lactiques » → alimentaire.
- [Innocent smoothies gourmands](https://offers.shopmium.com/fr/n/innocent-smoothies-gourmands) : « A retrouver au rayon frais » → alimentaire.
- [Kiri](https://offers.shopmium.com/fr/n/kiri-6) et [grands formats Bel](https://offers.shopmium.com/fr/n/grands-formats) : « Au rayon Fromage », parfois au milieu de la même ligne qu'une mention Drive → alimentaire (mais **Drive/livraison seulement**, règle inchangée).
- [OH PURÉE!](https://offers.shopmium.com/fr/n/puree-de-pomme-de-terre-oh-puree-1) : « Au rayon féculents/plats cuisinés » → alimentaire.
- [Ajax Power Mousse](https://offers.shopmium.com/fr/n/ajax-power-mousse) et [Ajax Power Clean](https://offers.shopmium.com/fr/n/ajax-power-clean-1) : « Au rayon Produits ménagers » → **non alimentaire**. Avec un remboursement maximal annoncé de 34 %, les exclure de la sélection principale (seuil de 50 % pour le non alimentaire).

Correction : le parseur reconnaît les pluriels, « produits ménagers », les ferments lactiques et la mention « A retrouver au rayon ». Un rayon non identifié reste « autre » et ne se transforme jamais arbitrairement en alimentaire sur la base d'un nom de marque. Les **huit catégories déjà documentées dans le snapshot** ont été corrigées sans changer les montants, dates de vérification, échéances ni conditions. Chaque resynchronisation recalculera les catégories avec le même parseur. Les avantages restent potentiels et non automatiquement cumulables.

Vérification : tests dans le fichier Shopmium existant et scénario Chromium Android sur les catégories du vrai JSON importé. Ce correctif n'établit pas à lui seul la disponibilité en magasin d'un produit.

## Jour civil et heures des promotions françaises — 11 octobre 2026

Les champs `verifiedAt`, `startsAt`, `expiresAt` et `reviewAfter` acceptent des **jours civils** (`YYYY-MM-DD`) et des horodatages ISO avec fuseau explicite. Une échéance au jour près concerne désormais toute la **journée Europe/Paris**, indépendamment du fuseau du navigateur Android ou du runner GitHub Actions en UTC. Exemple : `expiresAt: "2026-10-11"` n'est plus actif le 12 octobre à 00:00, heure de Paris (11 octobre à 22:00 UTC en octobre, avant le changement d'heure). Inversement, la vérification datée du 12 octobre ne devient pas anormalement future dans cette plage.

Un horaire précis comme `2026-10-12T14:07:00+02:00` continue à expirer à l'instant annoncé, sans prolongation jusqu'au soir. Les échéances d'ancienne validation Shopmium (cinq jours à partir de la date `verifiedAt`) ont également leur fin en **journée française**, et les compteurs « aujourd'hui / demain » utilisent le même calendrier.

Les contrôles préexistants de validité des dates civiles et fuseaux restent obligatoires. Le module de domaine et la PWA hors connexion ont été vérifiés à la transition entre les 11 et 12 octobre, ainsi qu'au passage à l'heure d'hiver du 25 octobre 2026. Aucun taux ni date de source n'a été prolongé.

## Contournement fonctionnel **sans** contourner les protections des enseignes — 11 octobre 2026

La collecte fiable est désormais répartie en trois voies distinctes :

1. **Shopmium et Coupon Network** : leurs pages officielles accessibles fournissent des candidats de remboursement datés et soumis aux conditions du fournisseur. Aucune fiche ne devient un EAN confirmé ou un cumul de gains simplement parce qu'elle apparaît sur le site.
2. **E.Leclerc** : pour les promotions déjà référencées et non expirées, la synchronisation commence par le HTML de la page officielle `nos-catalogues-promos-v2.e.leclerc`. Si elle n'y trouve pas *le produit et sa mécanique de remise dans le même passage*, elle peut lancer un navigateur Chromium sans compte sur **la même page publique** et réessayer sur le texte effectivement visible. Huit URL au maximum par exécution, arrêt sur 401/403/429 ; aucune requête privée ni extraction de CAPTCHA. Seules les promotions individuellement confirmées obtiennent une nouvelle date `verifiedAt`. Un échec ne prolonge jamais les campagnes.
3. **Carrefour** : l'accès `HTTP 403` aux fiches depuis GitHub Actions reste un refus d'accès. Nous ne le contournons pas, et les onze fiches de l'ancien snapshot restent archivées et non réactivées. Les [catalogues officiels Carrefour](https://www.carrefour.fr/catalogue) permettent une **consultation manuelle** ; ils ne prouvent pas un prix Drive/EAN local sans correspondance précise.

Pour vérifier manuellement une offre E.Leclerc, utiliser le [prospectus officiel E.Leclerc](https://www.e.leclerc/prospectus) ; rechercher l'article, les dates, les quantités et les conditions Tickets avant achat. Ne jamais déduire une économie automatique d'une simple présence dans le catalogue.

**Limite de couverture :** ce dispositif améliore la reconfirmation des **campagnes déjà connues** ; il ne crée pas artificiellement de nouvelles promotions retailer à partir de bannières. Une véritable intégration exhaustive des prix et stocks nécessitera des données détaillées ouvertes et autorisées (accord/API officielle/partenariat) ou une saisie humaine documentée.

## Validation des calendriers Shopmium — 12 octobre 2026

Le parseur des campagnes Shopmium refuse les jours impossibles (par exemple `31/02/2026`), les plages chronologiquement inversées et les heures qui n'existent pas au passage à l'heure d'été à Paris. Il calcule le décalage CET/CEST **à l'heure exacte annoncée** et non à midi. Lors de la répétition de 02:00–03:00 au changement d'heure d'automne, une heure ambiguë est interprétée prudemment : dernier instant possible pour un début, premier instant possible pour une fin. Une campagne dont la plage ne reste pas cohérente est ignorée, sans qu'une nouvelle date soit inventée.

La forme « jusqu'à 23:59 » reste une date de fin inclusive au niveau du jour civil, conformément à la règle d'expiration déjà utilisée par l'application. Cela évite qu'une fiche isolée avec une date erronée fasse échouer la validation de tout le catalogue après synchronisation. La CI et le parcours Android vérifient ces limites dans les contrôles existants.

## Classification prudente des 111 coupons alimentaires et non alimentaires — 12 octobre 2026

Le catalogue Coupon Network public est importé avec la catégorie générique `autre` pour ses fiches. Après normalisation, l'application reconnaît désormais comme **alimentaires** uniquement les familles de produits clairement nommées dans le titre ou les conditions : par exemple carottes, yaourts, fromages, café, compotes et produits de boulangerie explicitement identifiables. Les termes vagues comme « bio », « nature », « maison » ou la simple marque ne suffisent pas à qualifier un produit.

Les indices de **ménage, hygiène, produits pour animaux ou alcool** sont examinés en priorité : un shampooing « au lait » reste non alimentaire. Les boissons alcoolisées qui ne sont mentionnées que par leur nom de gamme connu dans le catalogue public (p. ex. Jack Daniel's ou Pelican Blonde) ne sont pas assimilées à l'alimentaire. Les réductions fixes sans prix de référence vérifié ne permettent pas d'affirmer que le seuil de **50 %** non alimentaire est atteint : elles restent exclues de la liste d'économies.

Les fiches sans signe assez spécifique conservent la catégorie `autre` (candidates conditionnelles), au lieu d'être déclarées alimentaires par défaut. La catégorie inférée sert **uniquement à la présentation et au filtrage** : elle ne certifie pas l'EAN, la disponibilité magasin, le montant effectivement remboursé ou le cumul. Les montants et dates du snapshot restent inchangés.
