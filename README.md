# Promo Alimentaire

PWA mobile-first pour regrouper et comparer les économies disponibles chez **Carrefour** et **E.Leclerc** : promotions, cashback, offres de remboursement (ODR), coupons, bons d'achat remisés et prix observés.

## État

Fonctionnalités actuelles :
- choix Carrefour / E.Leclerc ;
- filtre de canal d’achat : Magasin / Drive / En ligne ;
- tri par pourcentage d'économie, économie en euros ou fraîcheur ;
- raccourcis pour les offres chiffrées ≥50 % et les remboursements annoncés à 100 % sur un produit (sans les confondre avec une économie garantie) ;
- recherche d'offres ;
- chargement runtime de snapshots publics validés (Shopmium, La Belle Adresse, Coupon Network et Envie de Plus au 07/10/2026) avec expiration automatique ;
- contrôle quotidien de fraîcheur des snapshots via GitHub Actions, avec signalement des sources devenues entièrement obsolètes ;
- sync Shopmium public planifié deux fois par semaine avec extraction des dates, paliers et références éligibles ;
- sync La Belle Adresse planifié deux fois par semaine, avec revalidation forcée à 7 jours lorsqu'aucune date de fin publique n'est fournie ;
- synchronisation Coupon Network deux fois par semaine depuis la page publique, avec seuil minimal d'extraction et validation complète avant remplacement du snapshot ;
- annuaire de sources complémentaires ;
- annuaire filtrable des services alimentaires, dons, tests gratuits, ODR/cashback et ventes non alimentaires annonçant potentiellement au moins -50 % ;
- liste explicite des enseignes concernées, URLs de référence et avertissement sur les remises non garanties ;
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
- sauvegarde/restauration locale en JSON de la liste et du plafond de courses, sans compte, avec contrôle GTIN et confirmation avant remplacement ;
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

## Services de découverte (8 et 9 octobre 2026)

L'onglet **Sources** intègre des pistes indépendantes des prix du panier :
- **Produits gratuits / aide alimentaire** : MonAvisLeRendGratuit (hypermarchés Carrefour), Geev, HopHopFood, TRND, Sampleo, The Insiders, Home Tester Club et Linkee pour les étudiants avec justificatif. Soliguide référence aussi les distributions, épiceries sociales et autres solutions d'aide alimentaire. Disponibilité, sélection et conditions propres à chaque organisme.
- **ODR / cashback sur ticket** : Quoty décrit des remboursements après preuve d'achat, mais les pages publiques accessibles retrouvées datent majoritairement de 2025. Il reste **non confirmé pour les offres en cours** : ne pas utiliser les montants affichés comme des promotions actives.
- **Autres enseignes alimentaires** : Lidl Plus, Carte U, Auchan Waaoh!, e-coupons Intermarché et les épiceries NOUS anti-gaspi. Leurs remises ne sont pas utilisées comme des remises Carrefour ou E.Leclerc.
- **Restauration** : TheFork affiche des promotions pouvant aller jusqu'à -50 % dans certains restaurants et créneaux, sous conditions de réservation.
- **Autres domaines** : Veepee et Showroomprivé mettent en avant des ventes allant jusqu'à -70 %. Le filtre « Autres domaines : 50 % ou plus possibles » affiche ces **services à explorer**, et **non des articles individuellement confirmés** à -50 %.

Chaque fiche renvoie vers le service et, lorsqu'elle est distincte, la page source décrivant son mécanisme. Le tarif exact, la disponibilité géographique, le prix de référence et les éventuels quotas doivent être recontrôlés juste avant l'achat. Les pourcentages annoncés « jusqu'à » ne sont pas des promotions systématiquement disponibles. Les dons et essais gratuits ne sont jamais ajoutés au calcul d'économies du panier, et les cartes fidélité ne sont pas assimilées à des remises immédiates.

Les sources dont l'activité actuelle est incertaine restent explicitement **non confirmées**, sans date de vérification fictive ni offre chiffrée. Un service n'est pas ajouté au panier du seul fait de sa présence dans l'annuaire.

## Remboursements complets et restrictions Shopmium

Les offres 100 % sont affichées comme **possibilités conditionnelles**, jamais comme panier gratuit :

- la fiche Shopmium doit réellement mentionner un **remboursement du prix d'achat**, pas « 100 % bio », « 100 % végé » ou une description de produit ;
- les restrictions magasin `sauf Carrefour`, `hors E.Leclerc` ou une liste de magasins **uniquement** sont appliquées à l'enseigne sélectionnée ; une fiche ambiguë n'est pas importée ;
- un plafond monétaire (par exemple « 100 % dans la limite de 1 € ») est conservé, affiché et appliqué à l'estimation en euros, y compris dans les tris ;
- les défis qui demandent de débloquer l'offre ne sont jamais considérés comme un remboursement accessible sans action préalable ;
- les dates de fin et de revalidation restent obligatoires ; **aucune offre expirée n'est réactivée** pour remplir le filtre 100 %.
- les **remboursements fixes en euros** (ex. 1,50 € sur un pot de miel) sont extraits uniquement si le texte officiel indique explicitement « remboursement fixe de X € ». Ils restent des montants après achat et non des pourcentages calculés sans prix de référence.

Le filtre « 100 % remboursé sur un produit » **exclut les bundles et cagnotte fidélité** : ces mécanismes ne garantissent pas le remboursement de la totalité du prix d'un article isolé. Si aucune offre courante ne satisfait le filtre, l'application l'indique explicitement.

## Revalidation des fiches Shopmium (octobre 2026)

- Une **liste limitée de fiches officielles** (`data/shopmium-watchlist.json`) complète les offres visibles depuis l'index public. Chaque fiche est **téléchargée et reparsée** lors de la synchronisation ; le fichier de veille n'est **pas** une liste de promotions garanties.
- Les pages affichant **« Terminée »** ou **« demandes de remboursements closes »** sont ignorées, même lorsque l'ancien calendrier indiquait une date de fin postérieure. Exemple : fiche du miel L'Apiculteur, clôturée prématurément.
- L'éligibilité des canaux est explicite : une offre **Drive et livraison UNIQUEMENT** ne peut pas s'afficher dans le filtre **Magasin** ; une offre « Drive inclus » n'est pas automatiquement étendue aux achats en ligne si ces derniers ne sont pas annoncés.
- Les offres reconfirmées ont une révision programmée au plus tard quatre jours après observation. Par précaution, les **anciens snapshots Shopmium sans échéance de révision** sont masqués après cinq jours sans revalidation, même si leur date de fin était plus lointaine.
- L'ancien libellé de certains pourcentages sans signe moins (`3 articles = 30%`) est reconnu, sans convertir une mention marketing telle que « 100 % bio » en remise.
- Le collecteur refuse de remplacer le catalogue si l'index officiel ne révèle plus le minimum attendu d'offres valides.

Cette stratégie sacrifie temporairement la visibilité d'offres non revalidées plutôt que d'inciter à acheter un produit sur la foi d'un remboursement révoqué.

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
- `src/shopping-list-transfer.js` : transfert de liste, validation stricte et réduction des métadonnées importées.
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

## Sauvegarder et restaurer sa liste sur Android

Dans **Liste**, utiliser **Sauvegarder la liste** pour télécharger un fichier `.json` sur l'appareil. Pour le transférer vers un autre appareil, envoyer le fichier par le moyen de son choix, puis ouvrir l'application sur l'autre appareil, appuyer sur **Restaurer la liste**, sélectionner le fichier et confirmer.

- Les quantités, les codes-barres, les libellés produits et le budget facultatif sont inclus.
- La position, les prix relevés, les historiques et les réglages ne sont pas exportés.
- La restauration **remplace** la liste et le budget existants ; les prix doivent être actualisés après.
- Le contrôle refuse les codes GTIN incohérents, les doublons, les quantités hors limites, les sauvegardes inconnues et les fichiers de plus de 100 Ko.
- Un maximum de 30 produits distincts est autorisé. La sauvegarde et la restauration fonctionnent sans réseau une fois la PWA mise en cache.

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


### Tests mobiles et sources promotionnelles

Le [guide de test Android](docs/MOBILE_TESTING.md) décrit le parcours navigateur automatisé, les captures de CI et les vérifications à réaliser sur un vrai smartphone (caméra, GPS, PWA installée et hors ligne). Le scénario Chromium imite un écran Android mais ne constitue pas un test matériel.

Le registre Carrefour intègre 11 références avec GTIN lié à une fiche produit et prix affiché sur celle-ci. Les offres restent indicatives pour le Drive/livraison tant que le magasin n'a pas confirmé son prix. Les fiches peuvent répondre HTTP 403 à GitHub Actions : en cas d'échec, les dates de vérification **ne sont pas prolongées**. E.Leclerc : les candidats GTIN Open Food Facts sont conservés comme suggestions, non comme preuves officielles de promotion.


### Transparence sur la disponibilité des sources

Les fournisseurs qui bloquent leurs pages publiques ou renvoient des catalogues incomplets apparaissent maintenant dans le panneau de santé des données avec **la date de la dernière tentative** et **le nombre de promotions confirmées**. Une tâche automatisée verte signifie que les contrôles et le traitement ont réussi, **pas** que toutes les remises ont été revalidées. Les dates des offres restent inchangées tant qu'une preuve fournisseur est absente.

Les états Carrefour, E.Leclerc et Coupon Network sont stockés indépendamment afin d'éviter les conflits de synchronisation entre GitHub Actions.


### Prix observés récents et fiabilité des sources (8 octobre 2026)

Le panier privilégie le **relevé le plus récent**, même si un ancien prix promotionnel était inférieur. En cas de relevés contradictoires le même jour, le montant le plus élevé évite une estimation excessivement optimiste. Chaque ligne indique la date de la source ; les prix de plus de 30 jours sont signalés.

L'historique conserve les relevés pour plusieurs magasins physiques identifiables, au lieu de retenir un seul prix pour toute l'enseigne. Les baisses ne sont jamais détectées à partir de magasins distincts ou de prix contradictoires d'un même jour. Les observations dont le magasin n'est pas identifiable ne déclenchent pas d'alerte.

Une promotion immédiate ne devient pas automatiquement une économie acquise lorsque le dernier prix normal observé date de **plus de sept jours** ; elle reste candidate, à vérifier.

La santé des sources montre séparément :
- le nombre de promotions actives du dernier snapshot ;
- le nombre de promotions réellement reconfirmées lors de la dernière tentative de synchronisation ;
- la prochaine date de révision, qui reste visible en cas d'échec de synchronisation.

Le test Chromium avec émulation Android vérifie aussi les dates des prix, les états des sources, la navigation, le panier et la consultation hors ligne.


### Relevé personnel de prix en magasin

Lorsque la couverture Open Prices est insuffisante, l'onglet **Liste** propose un formulaire repliable **« Ajouter un prix relevé en magasin »**. Il enregistre, uniquement dans le `localStorage` du navigateur, le code-barres du produit déjà dans la liste, l'enseigne, le nom et le code postal du magasin, la date et le prix unitaire.

- Les relevés sont validés (prix positif, code-barres, magasin, code postal, date) et restent exploitables **30 jours maximum**.
- Ils ne sont pas envoyés à Open Prices ni à un serveur. Il est possible de les supprimer depuis le même panneau.
- Ils sont visibles avec la mention **« Relevé personnel non vérifié »**. Un relevé personnel ne devient pas une preuve commerciale et **ne déclenche pas automatiquement** les ODR, les remises catalogue, les cartes cadeaux ni les bénéfices fidélité.
- Les magasins identifiés par un simple nom et code postal restent **indicatifs** : ces prix ne peuvent pas à eux seuls désigner une enseigne gagnante.
- L'historique de baisses vérifiables reste fondé sur les observations communautaires, séparément des relevés personnels.
- La fonctionnalité reste disponible dans la PWA Android hors ligne après le premier chargement.

Pour vérifier ce parcours automatiquement, consulter le workflow **Android viewport smoke test**, qui produit également une capture `05-releve-manuel.png`.


### Plafond de dépenses en caisse

Dans l'onglet **Liste**, indique un budget de courses optionnel (0,01 € à 10 000 €). La valeur reste sur l'appareil et fonctionne hors ligne.

Le calcul compare ce plafond au **montant estimé à régler en caisse**, pas au coût économique après cashback, cagnotte fidélité ou remboursements différés. Ainsi, un remboursement futur ne masque pas un dépassement de trésorerie au moment du passage en caisse.

Chaque enseigne dispose de son propre statut :

- panier complet avec magasin et canal fiables : marge ou dépassement **estimé** ;
- prix manuels, canal Drive/en ligne ou recherche de prix partielle : résultat **indicatif** ;
- produit sans prix : aucun message « budget respecté » n'est affiché ;
- sous-total connu déjà supérieur au budget : alerte de dépassement même si le panier reste incomplet.

Le ticket de caisse réel reste prioritaire. Le comparateur ne réserve pas les prix, ne confirme pas les stocks et n'encaisse aucun paiement.
