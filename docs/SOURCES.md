# Sources et stratégie d'intégration

Dernière revue : 2026-10-07.

## Sécurité des économies fidélité Carrefour — revue du 11 octobre 2026

Source : [conditions PASS officielles](https://www.carrefour.fr/services/carte-pass), [FAQ Avantages Club](https://www.carrefour.fr/faq?question=est-ce-les-primes-fidelite), [activation dans l'application](https://www.carrefour.fr/faq?question=comment-puis-je-adherer-primes-fidelite).

L'activation explicite des avantages Club est requise. La carte PASS doit être rattachée au Club et utilisée pour le paiement afin d'obtenir les 15 % concernés. La réduction est **créditée en cagnotte**, ne se cumule pas automatiquement avec d'autres promotions, et exclut plusieurs catégories ou références, dont certains produits à 0,99 € ou 1,29 €, lots, fruits/légumes secs, conserves et surgelés. Le simple champ « je possède une carte » ne justifie donc **jamais** un gain en euros garanti.

Une catégorie/une marque Open Food Facts ne prouve pas un EAN éligible chez le commerçant : les avantages générés sont des **candidats heuristiques** sans `eans` fabriqués ni `autoStack`. Ils ne sont plus calculés après la date de révision tant que la source n'est pas reverifiée. Toute autre campagne expirée est également filtrée dans le moteur panier, même si l'appelant a oublié le filtrage de l'interface.

## Incident de synchronisation constaté le 10 octobre 2026

La vérification des journaux GitHub Actions établit deux défaillances différentes :

- **Carrefour** : les onze pages produit contrôlées ont répondu `HTTP 403` depuis le runner GitHub. Il s'agit d'un refus d'accès, pas d'une confirmation négative du prix. Le synchroniseur s'arrête désormais au premier 401/403 pour éviter les sollicitations répétées ; il ne contourne ni l'authentification ni les protections du site.
- **E.Leclerc** : les quatre pages de catalogue testées ont répondu, mais leur HTML récupéré ne contenait ni les libellés exacts ni les pourcentages/mécaniques des cinq offres attendues. Une page techniquement accessible ne constitue **pas** une preuve de promotion active. Le contenu peut dépendre d'un rendu dynamique.
- **Coupon Network** : le lien historique `index.rss` est indisponible (404 observé). Les fiches visibles dans une application rendue par JavaScript ne peuvent pas être assimilées à des preuves présentes dans le HTML brut accessible au synchroniseur.

**Comportement après correction :** les campagnes dont la révision ou la date de fin est dépassée ne sont plus interrogées ni reconfirmées. Les snapshots archivés restent en place, mais leurs offres périmées sont masquées par l'application. La dernière tentative d'accès reste consignée dans les diagnostics sans prolongation des dates.

**Chemins d'intégration conformes :** rechercher des API/flux de catalogue **publics ou officiellement autorisés**, obtenir un accord de données/partenariat, ou importer manuellement des offres possédant URL de source, preuve d'éligibilité exacte, magasin, prix, réduction et échéance. Ne pas traiter un HTTP 200 d'un simple squelette HTML comme une revalidation. Ne pas utiliser d'API privées ou de contournement anti-bot.

Les workflows de synchronisation possédant la permission `contents: write` restreignent les déclenchements `push` à `main` et exécutent leurs jobs d'écriture uniquement lorsque `github.ref == 'refs/heads/main'`. Cela inclut un déclenchement manuel (`workflow_dispatch`) sélectionnant une autre branche : aucune publication en production n'est autorisée depuis ce contexte.

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
