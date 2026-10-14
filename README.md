## Prospectus du jour et sélections à moins de 1 € (14 octobre 2026)

Le programme quotidien `scripts/sync-daily-campaigns.mjs` consulte désormais **aussi l'index public des prospectus Carrefour Hypermarché** : `https://www.carrefour.fr/catalogue/carrefour`, même lorsque les anciennes campagnes du flux sont expirées. Le moteur retient uniquement les **thèmes alimentaires explicitement reconnus**, une période « Du ... au ... » située immédiatement après le titre et **en cours ce jour en France**. Par exemple, le prospectus officiel « Au cœur du goût », du 13 au 26 octobre 2026, est référencé comme **prospectus alimentaire à consulter** dans l'onglet *Promos du jour*.

Les annonces officielles « produits du quotidien à moins de 1 € » et « recettes à petits prix » rejoignent les pistes de découverte lorsque leur titre, leur visuel et leur canal sont retrouvés sur `https://www.carrefour.fr/offres-du-moment`.

**Aucune transformation en promotion produit :** ces pistes n'ont ni EAN, ni prix de référence vérifié, ni réduction confirmée, ni avantage automatiquement cumulable. Elles sont horodatées au **jour civil Europe/Paris**, deviennent invisibles après minuit si non reconfirmées, ne servent pas à déclarer un achat « dans le budget » et les vérifications d'absence de faux tarifs font partie des contrôles GitHub et du parcours Android. Les catalogues hors alimentaire, futurs, expirés, les dates incohérentes et les pages bloquées sont rejetés. Les anciens candidats ne sont pas réactivés par simple consultation de l'index.

### Promos du jour : coût après avantage sans confondre trésorerie et économie (14 octobre 2026)

Dans l'onglet **Promos du jour**, le tri **Coût théorique le plus bas après avantage** compare le coût des lots pour lesquels **le prix initial et l'économie applicable à la quantité minimale sont tous deux documentés**. Le coût estimé après avantage s'affiche sur les fiches, mais reste un **scénario conditionnel** (référence éligible, bonne quantité, approbation du remboursement ou crédit fidélité).

**Exemple de vigilance :** un produit à 5 € remboursé intégralement coûte théoriquement 0 € *après remboursement*, mais il faut encore pouvoir **payer 5 € au départ**. Le filtre « budget maximum par achat » conserve donc impérativement le montant initial : ce produit ne figure **pas** avec un budget de 3 €. Un taux sans prix connu ne se transforme jamais en lot gratuit ; une source non reconfirmée n'affiche aucun nouveau coût après avantage. Le tri et le calcul n'additionnent pas les promotions potentiellement incompatibles et n'établissent pas le prix local en caisse.

Les vérifications existantes ont été étendues pour comparer les lots, exclure les prix absents, préserver les limites de trésorerie et vérifier le parcours Chrome Android.

### Catalogue du jour : pistes concrètes à vérifier même si la source n'a pas confirmé les offres (14 octobre 2026)

L'onglet **Promos du jour** inclut désormais **À vérifier aujourd'hui — catalogue non reconfirmé**, en dessous des promotions encore vérifiées. Il présente uniquement les anciennes offres produit de l'enseigne **dans leur période initiale de validité**, pour le **magasin et le canal actuellement sélectionnés**, lorsque le contrôle source a réellement échoué. Les campagnes expirées, les promotions d'autres enseignes et les annonces sans preuve ne sont jamais réactivées.

**Sécurité des prix** : cette section est une *liste de vérifications*, pas une liste de remises actuelles. Les éventuels pourcentages, coûts ou économies y sont explicitement indiqués comme **anciens**, les valeurs courantes sont `null`, et ces pistes ne rejoignent ni le TOP 3 ni les prix garantis ni le panier. Avec un budget maximal de 3/5/10/20 €, elles sont masquées : un ancien prix ne prouve pas la capacité actuelle à acheter le lot. Chaque entrée pointe vers sa source officielle, donne sa date de dernière preuve, son éventuel échec de synchronisation et sa date de fin annoncée.

Les scénarios de vérification existants sont étendus aux canaux magasin/Drive, échéances françaises, listes vides et parcours Android Chrome. La source E.Leclerc du 12 octobre ayant échoué, ces anciennes pistes deviennent visibles **pour contrôle manuel uniquement** tant que leur date de fin initiale n'est pas dépassée.

### Huit nouvelles promotions alimentaires issues du catalogue public E.Leclerc (12 octobre 2026)

Le lot `data/import/leclerc-catalog-2026-10-07.json` comprend désormais **8 promotions supplémentaires** relevées dans le [catalogue officiel « Nos promos du moment » du 6 au 17 octobre](https://nos-catalogues-promos-v2.e.leclerc/catalog/26G133G/1893), notamment :

- **Demae Ramen Nissin** : −68 % sur le 2e, **0,99 € + 0,32 €**, deux articles à payer initialement **1,98 €** avant une économie théorique de **0,67 €**.
- **Cassoulet Côté Table** : −40 % sur le 2e, **1,15 € + 0,69 €**, montant initial de deux articles **2,30 €**, économie théorique **0,46 €**.
- **Effilochés de thon Petit Navire** : **2+1 offert** à **2,50 €** l'unité, 3 articles nécessaires, coût de référence de **7,50 €** avant une économie théorique de **2,50 €**.
- **Olives noires Tramier**, mélange Menguy's et capsules L'OR Espresso Capri : −68 % sur le deuxième article ; taux effectif **34 % du lot de deux**, pas 68 % des courses.
- **Vinaigre balsamique Maille** : 4,79 € barrés, 3,35 € annoncés (−30 %) ; **plat cuisiné La Belle Chaurienne** : 11,49 € barrés, 7,58 € annoncés (−34 %).

Ces prix sont **indicatifs de l'annonce E.Leclerc au moment du relevé**, pas des prix en temps réel pour tous les magasins. Les nouvelles cartes sont des **candidats** qui ne se cumulent pas automatiquement. **Aucun code EAN n'est attribué sans fiche officielle univoque** : les articles de gamme sont marqués « référence/magasin à confirmer ». Les offres s'éteignent automatiquement à leur date indiquée (17 octobre maximum dans ce lot) si elles ne sont pas renouvelées par une preuve officielle récente.

## Promos du jour : meilleures offres et vérification quotidienne des campagnes (12 octobre 2026)

L'onglet **Promos du jour** propose désormais les **trois opportunités réelles à regarder en premier** à partir des lots produits actifs (Carrefour, E.Leclerc, Shopmium, Coupon Network). Il permet de trier par **pourcentage applicable à la quantité minimum**, **euros réellement estimables** ou **coût initial du lot** et de filtrer les lots dont le montant d'achat initial documenté dépasse **3, 5, 10 ou 20 €**. Lorsque le budget est activé, les offres sans prix ne sont jamais inventées ou considérées comme abordables. Le classement n'additionne pas des remboursements dont le cumul reste à vérifier.

Les cartes indiquent le nombre minimal d'articles, le coût initial indicatif **avant** remboursement ou cagnotte fidélité, la remise conditionnelle chiffrée et les liens de preuve. Les annonces publicitaires de « jusqu'à 60 % sur le deuxième » demeurent séparées et ne deviennent pas 60 % sur le panier entier.

Le programme `npm run sync:daily-catalogue -- --write`, exécuté chaque matin par `.github/workflows/sync-daily-campaigns.yml`, tente maintenant de **reconfirmer les campagnes publiques déjà connues** dans les pages officielles accessibles Carrefour/E.Leclerc. La reconfirmation exige **titre, mécanisme et date originale de fin proches dans le même passage public**. Elle ne prolonge jamais les dates de fin et ne crée **aucune** nouvelle remise sans fiche produit chiffrée. Si un marchand refuse l'accès ou si une preuve manque, la vérification reste datée et la PWA masque l'annonce après sept jours. Cette tâche ne permet pas encore d'extraire exhaustivement de nouveaux produits et prix catalogue sans source publique structurée.

## Catalogue du jour — recommandations sans prix inventés (12 octobre 2026)

L'onglet **Promos du jour** analyse à chaque ouverture ou changement de magasin/canal les derniers snapshots **encore actifs**, validés par l'ingestion existante (sources publiques mises à jour par les tâches planifiées Shopmium, Coupon Network, E.Leclerc et Carrefour). Les résultats sont séparés en :

1. **Promotions de l'enseigne** : Carrefour ou E.Leclerc, fiches produit et EAN exact indiqué uniquement si une URL de preuve existe ; prix, taux et économies en euros calculés lorsqu'il existe une base chiffrée vérifiée.
2. **Coupons et remboursements** : opportunités complémentaires non assimilées à des prix catalogue ; activation, limites et cumul à confirmer.
3. **Campagnes officielles** : avis publicitaires datés venant des liens officiels Carrefour et E.Leclerc, conservés dans `data/daily-campaigns.json`. Ces annonces n'entrent jamais dans les économies du panier et sont masquées à la fin de leur période en jour civil français.

Les campagnes enregistrées à ce jour restent un **relevé daté du 12/10/2026**, pas un robot capable de confirmer le prix et le stock de tous les magasins chaque matin. Chaque visite filtre automatiquement les offres selon leur échéance ; les synchronisations existantes alimentent régulièrement les fiches source. Si un catalogue est inaccessible, l'onglet propose le lien officiel, **sans promouvoir de remise fictive**. Un pourcentage de réduction sur le deuxième produit est calculé au taux effectif du lot uniquement lorsqu'un prix unitaire est documenté.

### Contrôles

Les tests existants couvrent la séparation enseigne/ODR, la priorité aux EAN prouvés, le filtrage magasin/canal et hors-alimentaire inférieur à 50 %, l'expiration Paris après minuit, les URLs officiellement autorisées et les réductions sur deuxième article. Le parcours Android vérifie la vue du jour et l'absence d'économies inventées.

## Relevés de prix à minuit en France (12 octobre 2026)

L'historique local et les alertes de baisse utilisent maintenant **la même date de preuve Open Prices en Europe/Paris** que la recherche des prix : les reçus du jour deviennent enregistrables dès 00 h 00 en France, sans attendre minuit UTC. Les relevés impossibles ou malformés sont refusés, les comparaisons restent limitées à un même magasin identifié et les seuils temporels ne sont pas prolongés artificiellement.

Les vérifications existantes couvrent un été UTC+2, un hiver UTC+1, les changements d'heure de mars/octobre et le parcours Chrome Android. Cela ne constitue pas une confirmation de prix magasin en temps réel.

# Promo Alimentaire

PWA mobile-first pour regrouper et comparer les économies disponibles chez **Carrefour** et **E.Leclerc** : promotions, cashback, offres de remboursement (ODR), coupons, bons d'achat remisés et prix observés.


## Dates des confirmations magasin en heure française (12 octobre 2026)

Une confirmation locale d'une promotion exacte chez Carrefour/E.Leclerc ne doit **jamais prolonger une offre après le minuit civil en France**. Jusqu'ici, les fins de campagne `YYYY-MM-DD` et échéances de relecture étaient interprétées à **23:59 UTC** : en octobre, une validation de magasin pouvait rester injustement valable environ **deux heures après minuit à Paris** ; le démarrage au début du jour pouvait à l'inverse être refusé. Les calculs utilisent désormais les mêmes dates civiles `Europe/Paris` que l'import et respectent les changements d'heure. Les dates avec heure/zone explicite gardent leur échéance instantanée.

Une preuve `verifiedAt` future ou invalide empêche également la confirmation ; pour Shopmium, la date de revue conservatrice de 5 jours borne la durée de preuve locale. Les anciennes confirmations locales conservées sur le téléphone ne peuvent pas réactiver une remise après la vraie date de fin : la validité de l'offre est revérifiée lors du calcul. Les confirmations restent strictement liées à un magasin physique identifié, à un EAN exact et à leur empreinte d'offre. Les vérifications couvrent le passage de minuit Paris et les changements d'heure été/hiver dans le navigateur Android.

## Fiabilité de l'état des sources après nouvelles preuves (12 octobre 2026)

Le panneau « État des données importées » ne signale plus une source active comme « non actualisée » au seul motif qu'un **ancien** contrôle avait échoué. L'alerte globale n'apparaît sur un fichier actif que si au moins une offre actuelle a reçu un avertissement `sourceSyncWarning` valide. Les échecs de synchronisation datés du futur ne sont pas traités comme des incidents déjà survenus. Les lots entièrement expirés conservent leurs diagnostics, sans aucune prolongation d'offre.

Les contrôles contre les remises non vérifiées restent stricts : lorsqu'un échec plus récent atteint la preuve d'une offre, celle-ci est conservée comme candidate et son cumul automatique est désactivé.

## État des promotions commerçants : lien magasin ou Drive (12 octobre 2026)

**Une promotion en magasin ne prouve pas le prix ou l'éligibilité en Drive/livraison.** Lorsqu'un fichier Carrefour ou E.Leclerc ne peut être reconfirmé, la PWA propose maintenant le lien public correspondant au canal choisi :
- Magasin : [catalogues Carrefour](https://www.carrefour.fr/catalogue) ou [prospectus E.Leclerc](https://www.e.leclerc/prospectus).
- Drive / livraison : [promotions Carrefour](https://www.carrefour.fr/promotions) ou [E.Leclerc DRIVE](https://www.leclercdrive.fr/).

Les liens s'actualisent avec le sélecteur de canal, même sur smartphone, et ne génèrent **aucune économie garantie** : il faut choisir le bon magasin/Drive et confirmer produit, période et prix final. Voir les [explications officielles Carrefour](https://www.carrefour.fr/faq?question=drive-pourquoi-existe-t-il-difference-entre-promotions-magasin-celle-drive) et [E.Leclerc](https://faq.e.leclerc/hc/fr/articles/360014892877-Comment-consulter-le-catalogue-et-les-promotions-E-Leclerc).

La revalidation automatisée de fiches Carrefour exige en outre un **titre de produit cohérent**, une marque, un terme de référence et la preuve chiffrée complète : prix promotionnel, prix habituel et pourcentage dans le même bloc. Une page catalogue, un titre générique ou des prix absents ne prolongent plus les campagnes historiques. Le site Carrefour limite toujours certains accès automatisés : aucune offre n'est fabriquée pour compenser.


## Correctif de fiabilité des remises Club Carrefour (11 octobre 2026)

Une carte Club Carrefour ou PASS **ne prouve pas** que les Avantages Fruits & Légumes / Carrefour Bio ont été activés, ni que le produit est éligible sans exclusion, ni que la Carte PASS sera utilisée pour payer. Le moteur propose donc une **économie potentielle conditionnelle** de 10 % ou 15 % mais ne l'ajoute plus au « gain garanti » par simple sélection d'une carte. Ces économies sont des **crédits en cagnotte**, pas des baisses automatiques du ticket de caisse. La règle est basée sur les [conditions officielles PASS](https://www.carrefour.fr/services/carte-pass) et les [modalités d'activation du Club Carrefour](https://www.carrefour.fr/faq?question=comment-puis-je-adherer-primes-fidelite), consultées le 11/10/2026. Les promotions en cours, lots et références exclues doivent être vérifiés avant achat.

La génération d'une offre contextualisée depuis Open Food Facts ne constitue pas une **preuve EAN exacte** chez Carrefour. Les anciennes offres sont filtrées **aussi dans l'évaluateur du panier**, y compris pour les appels hors interface. La revue des avantages contextualisés expire le 25/10/2026 : après cette date, aucune estimation ancienne n'est appliquée sans nouvelle confirmation.

## Correctif du budget et des prix historiques (11 octobre 2026)

Le budget de courses rejette maintenant **tout coût de caisse absent** (`null`, vide ou booléen) : aucune donnée manquante ne peut être convertie artificiellement en **0 €**. Un panier signalé « complet » doit réellement avoir un prix pour **chaque** référence. Les relevés Open Prices datés de plus de **7 jours** restent consultables comme informations historiques, mais le respect du budget passe obligatoirement au statut **indicatif** ; un comparateur de stratégies ne peut plus annoncer le magasin gagnant si l'un des paniers reposait sur un relevé ancien. Un relevé âgé de 7 jours et 12 heures reste historique : la fenêtre de 7 jours est calculée sur la durée exacte et non sur l'âge arrondi à l'entier inférieur. Un relevé frais n'est pas une promesse de prix ou de stock actuel.

Ces protections ont été vérifiées dans le parcours navigateur Android, en testant ensemble les vrais modules panier, budget et stratégie, y compris les totaux manquants et les relevés vieillissants.

## Relevés Open Prices : date civile française et fraîcheur (11 octobre 2026)

Les dates simples de l'API Open Prices représentent désormais le **début du jour civil en Europe/Paris**, y compris lors des changements d'heure d'été/hiver. Un relevé daté du jour n'est plus considéré comme futur à 00 h 30 à Paris lorsque l'UTC affiche encore la veille. Les étiquettes de fraîcheur (7, 30 et 120 jours) et l'avertissement « ancien prix » comparent la **durée exacte**, sans utiliser le nombre de jours révolus affiché pour franchir un seuil. La date du relevé reste une observation communautaire, non une garantie de tarif actuel.

Le parcours fonctionnel sur navigateur Android vérifie le basculement de jour en France, les deux dates de changement d'heure, le rejet des dates impossibles et les frontières des catégories de fraîcheur.

## Synchronisation Coupon Network : source publique supplémentaire (11 octobre 2026)

Le collecteur consulte désormais également la [page officielle des offres publiques Coupon Network](https://prod-cn-offers.couponnetwork.fr/). Si le HTML initial ne contient pas de cartes complètes, le job GitHub Actions tente un rendu Chromium public et sans connexion, avec Playwright open source. Si le contenu effectivement lu révèle des cartes complètes (produit, conditions, montant et action d'activation), elles peuvent remplacer l'ancien snapshot **après validation du nombre, des identifiants et des conditions**. Un simple chargement dynamique affichant zéro offre, l'ancien RSS indisponible ou une réponse trop courte n'actualise aucune date et ne remplace jamais l'archive. Ces remboursements après achat restent des **candidats**, sans EAN exact ni réduction immédiate garantie. La réussite du synchroniseur sur le runner GitHub doit être vérifiée séparément de la présence de ce code.

## Filtre alimentaire sur Coupon Network (11 octobre 2026)

Le catalogue public Coupon Network peut mélanger remboursements alimentaires, lessives, hygiène, animaux et boissons alcoolisées sans catégorie fiable dans les données brutes. À l'import, les **libellés non alimentaires explicites** sont identifiés de manière conservatrice. Ces candidats sont soumis à la règle du projet : **hors alimentaire uniquement si une économie de 50 % ou plus est réellement calculable**. Une offre à montant fixe sans prix de référence ne prouve pas 50 % et reste masquée dans ce cas. Les offres alimentaires et catégories non concluantes restent candidates, sans confirmation automatique. Le parcours Android valide ces distinctions sur le moteur d'import et le filtrage réel.

## Garde-fou des promotions liées à une carte fidélité (11 octobre 2026)

L'import d'un catalogue marchand ne peut plus fournir seul le drapeau `autoStackWhenEligible` pour faire passer une remise sans preuve dans les gains garantis après sélection d'une carte fidélité. Le moteur neutralise ce droit pour les fichiers importés, tout en préservant les bons d'achat de paiement soumis à leurs contrôles spécifiques. Le test fonctionnel Android vérifie ensemble une remise produit et une remise panier fictives à 90 %, ainsi qu'un bon d'achat valide.

## Comparaison des magasins : recherches Open Prices partielles (11 octobre 2026)

Un panier peut contenir un prix récent pour chaque produit alors que la recherche Open Prices n'a pas fini toutes les pages nécessaires, ou qu'une requête réseau a échoué. Jusqu'ici, le bandeau de comparaison annonçait « aucun gagnant » dans cette situation, mais le bloc **Meilleure stratégie garantie** pouvait simultanément afficher Carrefour ou E.Leclerc gagnant. Le moteur de stratégie et l'interface appliquent désormais le **même indicateur de couverture incomplète** déjà utilisé pour le budget. Le résultat passe en **indicatif** et aucun magasin gagnant ni stratégie chiffrée dite garantie n'est désigné avant une recherche suffisamment complète. Un relevé complet reste une observation, non une promesse de tarif.

Le contrôle de régression est intégré aux vérifications existantes du moteur et au parcours navigateur Android ; aucun nouveau fichier de tests unitaires n'a été créé.

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

Le validateur d'annuaire refuse désormais les **dates de vérification fictives, impossibles ou postérieures au jour courant en France**. Un service identifié ne doit jamais sembler avoir été confirmé dans le futur, notamment si l'application est consultée depuis un autre fuseau horaire.

## Services de découverte (8 et 9 octobre 2026)

L'onglet **Sources** intègre des pistes indépendantes des prix du panier :
- **Produits gratuits / aide alimentaire** : MonAvisLeRendGratuit (hypermarchés Carrefour), Geev, HopHopFood, TRND, Sampleo, The Insiders, Home Tester Club et Linkee pour les étudiants avec justificatif. Soliguide référence aussi les distributions, épiceries sociales et autres solutions d'aide alimentaire. Disponibilité, sélection et conditions propres à chaque organisme.
- **ODR / cashback sur ticket** : Quoty décrit des remboursements après preuve d'achat, mais les pages publiques accessibles retrouvées datent majoritairement de 2025. Il reste **non confirmé pour les offres en cours** : ne pas utiliser les montants affichés comme des promotions actives.
- **Partage alimentaire local** : Olio (application Android/plateforme) propose des dons alimentaires et parfois des prix réduits dans des commerces locaux. Disponibilité variable selon la ville, collecte en personne pour les dons, sans promesse de stock.
- **Livraison anti-gaspillage** : Bene Bono vend des produits alimentaires sauvés du gaspillage avec des tarifs variables. L'éligibilité du code postal, les frais et les conditions de livraison doivent être vérifiés, sans prétendre qu'il s'agit d'une remise Carrefour/E.Leclerc.
- **Autres enseignes alimentaires** : Lidl Plus, Carte U, Auchan Waaoh!, e-coupons Intermarché et les épiceries NOUS anti-gaspi. Leurs remises ne sont pas utilisées comme des remises Carrefour ou E.Leclerc.
- **Restauration** : TheFork affiche des promotions pouvant aller jusqu'à -50 % dans certains restaurants et créneaux, sous conditions de réservation.
- **Autres domaines** : Veepee et Showroomprivé mettent en avant des ventes allant jusqu'à -70 %. Le filtre « Autres domaines : 50 % ou plus possibles » affiche ces **services à explorer**, et **non des articles individuellement confirmés** à -50 %.

Chaque fiche renvoie vers le service et, lorsqu'elle est distincte, la page source décrivant son mécanisme. Le tarif exact, la disponibilité géographique, le prix de référence et les éventuels quotas doivent être recontrôlés juste avant l'achat. Les pourcentages annoncés « jusqu'à » ne sont pas des promotions systématiquement disponibles. Les dons et essais gratuits ne sont jamais ajoutés au calcul d'économies du panier, et les cartes fidélité ne sont pas assimilées à des remises immédiates.

Les sources dont l'activité actuelle est incertaine restent explicitement **non confirmées**, sans date de vérification fictive ni offre chiffrée. Un service n'est pas ajouté au panier du seul fait de sa présence dans l'annuaire.

## Transparence de la date des économies affichées

Le pied de page distingue maintenant **la date du catalogue de référence** (offres intégrées manuellement au code), **le nombre d'offres importées réellement actives** après contrôle de leurs échéances et **la date de preuve la plus récente parmi ces offres actives**. La date de rechargement d'une page, celle du manifeste JSON ou un contrôle GitHub Actions sans preuve marchande ne sont jamais présentés comme une nouvelle vérification des promotions. Si les fichiers d'import ne sont pas accessibles, l'application indique qu'elle utilise seulement le catalogue de référence, sans annoncer de revalidation inexistante.

## Sources pertinentes selon l'enseigne choisie (12 octobre 2026)

L'onglet **Sources** utilise désormais le même choix de magasin que l'onglet **Offres**. Lorsque E.Leclerc est sélectionné, les programmes uniquement Carrefour (offres officielles, Club Carrefour, MonAvisLeRendGratuit) ne sont plus présentés comme des pistes utilisables en caisse E.Leclerc, et inversement. Les services utilisables dans les deux enseignes (Shopmium, Coupon Network, etc.) ainsi que les services indépendants (Geev, Soliguide, aide alimentaire) restent accessibles. Le changement est immédiat sur Android, sans changer la catégorie ni effacer la recherche.

Le répertoire reste une sélection de **services à consulter**, jamais une confirmation de remise, de disponibilité locale ou de cumul.

## Offres officielles Carrefour accessibles même sans fiche EAN (12 octobre 2026)

La page publique [Carrefour — offres du moment](https://www.carrefour.fr/offres-du-moment) annonce des opérations alimentaires, les promotions hebdomadaires et des sélections petit budget (par exemple fruits/légumes ou produits du quotidien à moins de 1 €). Le lien figure désormais dans l'annuaire **Sources** et dans le panneau de diagnostic quand le catalogue produit Carrefour n'est pas reconfirmé. Les conditions réelles et le prix varient selon le point de vente, le canal, la période et la quantité.

**Distinction essentielle :** une campagne publicitaire (« jusqu'à -60 % sur le 2e », « 2+1 » ou « moins de 1 € ») n'est ni un SKU prouvé ni une économie garantie : elle ne crée aucun EAN, aucun panier remisé et aucun cumul automatique dans l'application. L'échec du flux de fiches Carrefour reste visible et les anciennes offres restent expirées.

### Offres réellement concernées par un échec de synchronisation (12 octobre 2026)

Le panneau **Santé des sources** compte maintenant les **offres encore actives sous alerte de synchronisation** (prix/remises à vérifier ; gain non garanti). Une offre dont la preuve a été renouvelée **après** l'échec de synchronisation n'est pas dégradée ; une fiche expirée ne compte pas comme une alerte active.

Le rapport quotidien `npm run check:freshness` présente distinctement le statut `sync-warning`, le nombre d'offres affectées et une annotation `warning` dans GitHub Actions. Le total « offres actives » reste un total de **fiches consultables**, pas de réductions garanties. Un échec de synchronisation ne prolonge jamais artificiellement une offre, et le contrôle strict de péremption conserve son fonctionnement existant.

### Fiabilité identique pour le diagnostic GitHub et la PWA

`npm run check:freshness` réutilise la même fonction de calcul d'échéances que le chargeur des sources publiques : uniquement **offres encore actives**, première date entre revue, expiration et plafond prudent Shopmium, dernière milliseconde du jour civil **Europe/Paris** pour `YYYY-MM-DD`, et jours calendaires pour l'alerte (y compris les changements d'heure). Les échecs de synchronisation obsolètes ou datés du futur ne masquent plus les promotions vérifiées après l'incident. Un rapport CI n'annonce donc plus une date de revue lointaine provenant d'une ancienne campagne expirée.

## Robustesse des synchronisations de promotions

Les synchronisations Carrefour/E.Leclerc ne confondent plus « campagne encore éligible à une vérification » et « ancienne fiche historique ». Les offres expirées restent archivées sans être prolongées ni interrogées inutilement. Un refus d'accès `HTTP 401/403` chez Carrefour interrompt les requêtes restantes vers ce fournisseur, sans tentative de contournement ; le diagnostic indique le nombre de requêtes évitées. Côté E.Leclerc, un HTML chargé sans preuve du produit et du taux ne constitue pas une revalidation. Coupon Network distingue aussi une page publique accessible mais dont les offres ne figurent pas dans le HTML disponible au synchroniseur (rendu côté navigateur possible). Les erreurs laissent les dates et prix intacts.

Les workflows susceptibles de pousser des snapshots sur `main` sont déclenchés par un `push` **uniquement sur `main`** ; leurs jobs d'écriture possèdent également un garde explicite `github.ref == 'refs/heads/main'` pour empêcher qu'un déclenchement manuel sur une branche de travail écrive en production. Les branches de travail conservent les vérifications ordinaires CI/Android. Les limites d'accès des enseignes imposent pour élargir la couverture un flux public exploitable, un partenariat autorisé ou des données manuelles vérifiables ; une requête refusée n'est jamais traitée comme une nouvelle promotion.

## Contrôle des dates des offres importées

Les snapshots de promotions et de cashback doivent contenir des dates ISO calendaires réelles (par exemple `2026-10-11`) ou des horodatages ISO complets avec fuseau explicite. Une date impossible (`2026-02-30`), un format ambigu ou un caractère parasite fait désormais rejeter le lot concerné par le validateur. Une preuve `verifiedAt` située **dans le futur** n'est jamais traitée comme une offre active, même si sa date de fin est encore éloignée. Les catalogues déjà publiés conservent leurs dates d'origine et ne sont **pas** artificiellement reconfirmés.

Le contrôle fonctionnel Android exerce directement le moteur d'ingestion : dates impossibles, date d'expiration incorrecte, preuve future et horodatage valide avec décalage horaire. Les tentatives de synchronisation Carrefour, E.Leclerc et Coupon Network peuvent être indisponibles sans que les anciennes offres soient prolongées pour autant.

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
- Cette surveillance couvre aussi deux offres alimentaires Charal détectées dans les pages officielles (Bœuf Bourguignon et Pièce de bœuf à effilocher). Leur statut est recalculé lors du prochain passage, jamais figé dans le catalogue.
- Si la source précise **« jusqu'à 14:07 »** (plutôt que 23:59), cette heure est conservée avec le fuseau **Europe/Paris** et son décalage été/hiver. Une offre expirant à 14 h 07 ne reste donc pas visible jusqu'à minuit ; les heures de début explicites sont également conservées.
- Les pages affichant **« Terminée »** ou **« demandes de remboursements closes »** sont ignorées, même lorsque l'ancien calendrier indiquait une date de fin postérieure. Exemple : fiche du miel L'Apiculteur, clôturée prématurément.
- L'éligibilité des canaux est explicite : une offre **Drive et livraison UNIQUEMENT** ne peut pas s'afficher dans le filtre **Magasin** ; une offre « Drive inclus » n'est pas automatiquement étendue aux achats en ligne si ces derniers ne sont pas annoncés.
- Les offres reconfirmées ont une révision programmée au plus tard quatre jours après observation. Par précaution, les **anciens snapshots Shopmium sans échéance de révision** sont masqués après cinq jours sans revalidation, même si leur date de fin était plus lointaine.
- L'ancien libellé de certains pourcentages sans signe moins (`3 articles = 30%`) est reconnu, sans convertir une mention marketing telle que « 100 % bio » en remise.
- Le collecteur refuse de remplacer le catalogue si l'index officiel ne révèle plus le minimum attendu d'offres valides.

Cette stratégie sacrifie temporairement la visibilité d'offres non revalidées plutôt que d'inciter à acheter un produit sur la foi d'un remboursement révoqué.

## Comparer les prix d'un même GTIN sans fausse précision

L'onglet **Produit** propose une comparaison à la demande de l'**EAN/GTIN exact** entre Carrefour et E.Leclerc. Les promotions de simple marque ou gamme, sans GTIN confirmé, ne deviennent **jamais** des offres exactes. Les prix proviennent d'Open Prices et restent des observations communautaires, pas des prix de caisse garantis.

La comparaison montre le prix de chaque enseigne même si les observations ne sont pas directement comparables. Elle n'annonce un « relevé inférieur » qu'avec :
- **les deux prix disponibles**, datés chacun de **7 jours au maximum**, et avec un écart entre dates de **3 jours au maximum** (durée exacte, sans arrondir avant le contrôle) ;
- une **proximité justifiée** par des coordonnées à **15 km maximum**, ou, sans coordonnées, par une même commune **et** un même code postal à cinq chiffres ;
- une même référence GTIN valide et un canal d'achat compatible. Les relevés de magasins physiques ne sont pas traités comme des devis Drive/livraison.

Pour éviter de manquer une vraie comparaison locale, le moteur peut sélectionner **une paire de relevés comparables légèrement antérieurs**, même si le tout dernier relevé Carrefour ou E.Leclerc provient d'une autre ville. Le choix repose sur la date, puis la proximité géographique, **jamais sur le prix le plus bas**. Le détail des deux relevés retenus (prix, date et magasin) est affiché séparément des derniers prix individuels des enseignes. Aucune baisse ou économie n'est garantie par les observations communautaires.

Si une condition manque, le moteur affiche une explication contextualisée sans désigner de magasin gagnant. Les remboursements restent hypothétiques et **plusieurs remises ne sont jamais additionnées arbitrairement**. Cela ne remplace pas la vérification des stocks, des prix en magasin et des conditions d'offre.

## Simulation du coût net avec mon prix

L'onglet **Offres** accepte un **prix unitaire saisi manuellement** et une **quantité prévue** (1 à 100). Un mode de tri **Gain simulé (€) selon mon prix** utilise exclusivement ces valeurs pour les offres ciblant un produit, sans inventer de prix magasin ni confondre plusieurs références.

La simulation distingue :

- **Débours initial** : prix unitaire × quantité ; une ODR fabricant peut nécessiter le paiement complet avant remboursement.
- **Économie potentielle** : en respectant la quantité minimale, les paliers de quantité, les plafonds en euros et le mode de remboursement par offre ou par unité.
- **Coût après remboursement éventuel** : débours initial diminué de cette économie, calculé à titre indicatif. L'écart en pourcentage est basé sur le coût total réellement simulé, pas le pourcentage publicitaire maximal.

Une offre qui concerne 3 articles et promet jusqu'à 30 % **ne récupère pas automatiquement ces 30 % à une autre quantité**. Une fois la dernière tranche dépassée, la simulation reste non applicable plutôt que d'inventer une réduction. Les offres panier sont exclues de la simulation par prix unitaire.

**Limites :** le même prix indicatif est appliqué à toutes les fiches visibles uniquement pour comparer leurs mécanismes. Cela ne vérifie ni la disponibilité, ni le bon EAN, ni l'éligibilité du magasin, ni le remboursement final, ni la possibilité de cumuler les offres. Il faut toujours consulter la source officielle avant tout achat.

## Comparer un même EAN chez Carrefour et E.Leclerc

Depuis l’onglet **Produit**, scanner/rechercher un code-barres valide puis sélectionner **Comparer cet EAN dans les deux enseignes**. Une nouvelle recherche Open Prices est déclenchée **séparément** pour Carrefour et E.Leclerc, sans mélanger leurs relevés.

- Seuls les produits portant **exactement le même GTIN valide** (y compris les représentations UPC-A/EAN-13/GTIN-14 équivalentes) sont comparés ; les correspondances par marque/nom restent de simples pistes et **n'alimentent jamais le tableau des promotions exactes**.
- Les derniers prix communautaires datés de moins de **30 jours** sont affichés avec leur enseigne et magasin. Si un magasin manque de relevés, aucun prix n'est imaginé et aucun « gagnant » n'est désigné.
- Les observations d'achats physiques ne sont pas converties en prix Drive/livraison, puisque les prix et promos peuvent différer.
- Une remise n'est **jamais additionnée** à une autre : seule la meilleure économie indépendante est affichée comme scénario conditionnel. Les prix déjà signalés comme remisés ne sont jamais soustraits une seconde fois.
- Les remises propres au distributeur (promotion enseigne, Ticket fidélité) et les canaux ou prix qui nécessitent une vérification supplémentaire ne sont **jamais soustraits** d'un relevé communautaire : le prix observé peut déjà intégrer la promotion.
- Un **GTIN en URL de fiche distributeur** atteste de l'identité de référence, pas de la disponibilité de l'offre, du stock ou du prix actuel.
- Le comparateur fonctionne sur demande (deux appels publics Open Prices) et n'enregistre pas de localisation, ni de prix non confirmés. Il invalide le résultat si le produit, le canal, l'enseigne, le rayon de proximité, la géolocalisation ou le profil fidélité change, même pendant une recherche.

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

Les alertes de baisse comparent uniquement deux observations à des **dates différentes dans un même magasin physique identifié** (identifiant magasin, ou nom et code postal). Deux magasins distincts d'une même enseigne ne peuvent pas produire une fausse baisse. Un prix sans magasin suffisamment identifié n'alimente pas les alertes. Les contrôles sont locaux et ne tournent pas en arrière-plan. Les cartes d'alerte visibles dans l'application sont désormais limitées à un **dernier relevé daté de 14 jours au maximum**, avec sa date affichée. Si ce relevé correspond à un **ticket remisé**, la baisse est présentée comme potentiellement ponctuelle et non comme un prix de rayon durable. L'historique plus ancien demeure consultable mais ne déclenche pas une alerte d'achat actuelle.


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

L'historique conserve les relevés pour plusieurs magasins physiques identifiables, au lieu de retenir un seul prix pour toute l'enseigne. Les baisses ne sont jamais détectées à partir de magasins distincts ou de prix contradictoires d'un même jour. Les observations dont le magasin n'est pas identifiable ne déclenchent pas d'alerte. Si le dernier magasin observé n'a qu'un seul relevé, l'onglet Produit recherche le **magasin identifié le plus récent avec deux dates comparables**, plutôt que d'afficher une fausse absence de tendance. Le calcul ne mélange jamais les magasins. Les dates de la tendance sont affichées, avec une mise en garde sur les anciens prix ou tickets remisés.

L'identité du produit dans l'historique local et les alertes est maintenant harmonisée en **GTIN-14 canonique** lorsque la clé de contrôle GS1 est valide. Les variantes UPC-A, EAN-13 et GTIN-14 du même produit correspondent à une seule référence ; les données existantes sur le téléphone restent lisibles sans migration destructive. Les relevés répétés de même prix, date et magasin sont dédoublonnés. Les codes locaux non-GTIN déjà enregistrés restent compatibles, sans être interprétés comme des EAN fiables.

La **liste de courses** reconnaît également les codes UPC-A/EAN-13/GTIN-14 ayant la même clé GS1 : rescanner le même produit augmente sa quantité dans la ligne existante tout en conservant le code initial pour les liens et les recherches de prix. Une ancienne liste locale contenant des représentations dupliquées est consolidée tant que la quantité totale reste dans la limite de 99 ; aucune quantité supérieure à cette limite n'est effacée silencieusement. Les sauvegardes JSON rejettent les produits dupliqués sous des représentations équivalentes, plutôt que de créer des doublons artificiels.

Les **prix saisis manuellement** suivent la même identité GS1 vérifiée : un prix personnel associé à un UPC-A peut être utilisé par la ligne de panier EAN-13/GTIN-14 équivalente, uniquement pour la même enseigne. Les doublons de relevés personnels ayant le même magasin, code postal et date sont regroupés, en conservant le relevé le plus récemment enregistré. La provenance **personnelle, non vérifiée** reste indiquée : aucun prix manuel ne devient un prix confirmé par Carrefour ou E.Leclerc.

Une promotion immédiate ne devient pas automatiquement une économie acquise lorsque le dernier prix normal observé date de **plus de sept jours** ; elle reste candidate, à vérifier.

La santé des sources montre séparément :
- le nombre de promotions actives du dernier snapshot ;
- le nombre de promotions réellement reconfirmées lors de la dernière tentative de synchronisation ;
- la prochaine date de révision, qui reste visible en cas d'échec de synchronisation.

Le test Chromium avec émulation Android vérifie aussi les dates des prix, les états des sources, la navigation, le panier et la consultation hors ligne.

La simulation Android utilise des **dates de reçus relatives à l'exécution**, afin que les exemples restent récents lors des futures exécutions CI. Le parcours vérifie également un échec réseau sur la deuxième page Open Prices : les prix déjà chargés restent visibles, la couverture est explicitement signalée comme partielle, et l'approfondissement reste une action volontaire. Les tests historiques des échéances d'offres utilisent, eux, des horloges fixées intentionnellement pour vérifier les bornes exactes.


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

### Fiabilité des dates pour les relevés personnels (12 octobre 2026)

La saisie d'un prix Carrefour ou E.Leclerc conserve le **jour d'achat français (Europe/Paris)**, quelle que soit la configuration horaire du smartphone. Le calendrier accepte aujourd'hui et les **30 jours civils précédents au maximum** (jour de relevé = jour 0), mais jamais un jour futur. Les transitions entre heure d'été et heure d'hiver n'avancent ni ne reculent l'expiration d'un relevé, et le champ de date de la PWA s'actualise si l'onglet reste ouvert après minuit. Les sauvegardes au nom daté utilisent la même journée française.

Ces prix restent **personnels et indicatifs**, sans preuve d'une remise publique, sans partage ni promesse de cumul automatique. Les anciens relevés devenus trop vieux sont exclus au chargement. Les vérifications de non-régression couvrent minuit à Paris, les deux changements d'heure et le parcours Chrome Android simulé.

### Couverture des prix par EAN exact

Les cartes Carrefour et E.Leclerc indiquent maintenant, séparément, si les relevés Open Prices sont absents, non exploitables, anciens (plus de 30 jours), récents (30 jours) ou suffisamment récents (7 jours). Elles indiquent le nombre de relevés exploitables et la date du dernier relevé. **Aucune observation** ne signifie pas **aucun stock** : une absence de prix communautaire n'est jamais une preuve que le produit n'est pas vendu. Une panne de la source est présentée comme une couverture inconnue, non comme une absence de produit.

Les dates Open Prices sont comparées selon leur **instant réel** (formats YYYY-MM-DD et horodatages ISO avec fuseau horaire compris). L'étiquette « Dernier relevé consulté » conserve la date fournie par la source sans confondre un ordre alphabétique de chaînes et l'ordre chronologique.

**Limites de pagination Open Prices.** L'application interroge un nombre plafonné de pages pour éviter de surcharger le service. Elle distingue désormais une recherche complète, une recherche volontairement limitée aux premières pages et une recherche partiellement interrompue (par exemple une erreur réseau sur la deuxième page). Un nombre de relevés ou une absence de prix porte **uniquement sur les pages effectivement consultées** et jamais sur l'intégralité des stocks ou de la base Open Prices. Les métadonnées brutes `total` peuvent couvrir d'autres enseignes : elles ne sont donc pas présentées comme un nombre de prix Carrefour ou E.Leclerc. Une réponse vide ou plus courte que prévu **n'est pas une preuve d'exhaustivité** si les métadonnées de l'API annoncent encore d'autres pages : la couverture reste explicitement incomplète, même lorsque l'application arrête prudemment la pagination.


### Recherche approfondie des prix pour un EAN

Si la comparaison Carrefour / E.Leclerc indique une recherche partielle ou interrompue, le bouton **« Approfondir la recherche »** permet, sur demande, de refaire les deux recherches Open Prices jusqu'à **3 pages** avec un seuil de **20 relevés** exploitables par enseigne, au lieu du parcours rapide initial de 2 pages et 4 relevés. Il s'agit d'une action réseau volontaire, pas d'une surveillance en arrière-plan. Le résultat peut rester incomplet si les données sont paginées davantage ou si une source échoue. Dans la **liste de courses**, les relevés Open Prices qui alimentent le budget estimé disposent également d'un lien individuel de vérification. Les prix saisis personnellement n'en reçoivent jamais : ils restent identifiés comme estimations non vérifiées.

Les prix ayant un identifiant numérique Open Prices valide disposent maintenant d'un lien **« Consulter ce relevé sur Open Prices »**. Le détail de la paire de magasins comparés propose également les liens des deux relevés retenus, qui peuvent différer des derniers prix affichés dans les cartes. Les identifiants absents ou incorrects ne produisent jamais de lien. Ces liens améliorent la traçabilité, mais ne transforment pas une observation communautaire en prix garanti.

Les cartes restent spécifiques à l'EAN, aux enseignes et au canal choisi ; aucun prix Drive n'est déduit d'un relevé en magasin.

La recherche approfondie ne garantit ni stock ni prix en caisse. Lorsque des pages restent inconnues, le texte précise que la comparaison porte uniquement sur les relevés consultés. Les observations datées dans le futur ne sont plus comptabilisées comme une couverture valide.


### Performances de la comparaison mobile

Pour un EAN disposant de nombreux relevés, le moteur conserve uniquement **la meilleure paire comparable trouvée au cours du parcours**. Il n'accumule et ne trie plus toutes les combinaisons Carrefour × E.Leclerc en mémoire. Les règles de sélection restent identiques : dates récentes, proximité démontrée, preuves, puis prix prudent lorsque les observations se contredisent. Le coût mémoire supplémentaire devient constant (au lieu de croître avec le nombre de paires). Le parcours Android vérifie une simulation de 180 relevés par enseigne, soit **32 400 paires candidates**.


### Provenance temporelle des relevés Open Prices

Seule la **date réelle du relevé de prix** (champ date de la fiche Open Prices) peut servir à qualifier un tarif comme récent. La date de création ou de mise à jour du **dossier informatique** ne prouve pas qu'un prix a été observé ce jour-là : ces dates de métadonnées ne sont jamais utilisées comme dates de ticket ou de rayon. Les observations sans date sont conservées comme non exploitables pour la couverture, mais ne sont pas retenues pour chiffrer un prix ou déclarer un magasin moins cher. Elles ne bloquent plus la recherche d'une page suivante : le seuil d'arrêt anticipé porte sur les **relevés exploitables de 30 jours au plus**, et non sur le nombre brut de fiches.

Le parcours Android vérifie ce scénario avec quatre lignes sans date, pourtant récemment mises à jour, puis une fiche correctement datée trouvée sur la page suivante.


### Quantités dans le comparateur EAN exact

L'onglet **Produit** accepte maintenant une **quantité entière de 1 à 100** avant de comparer Carrefour et E.Leclerc. Les prix relevés restent exprimés par unité ; les cartes ajoutent le débours hypothétique pour la quantité choisie, avant remboursements. Les offres rattachées à l'EAN exact respectent leur quantité minimale. Lorsqu'un remboursement est chiffrable, son montant et le coût après remboursement concernent la **quantité sélectionnée** ; l'application n'additionne toujours pas plusieurs offres incompatibles.

Modifier la quantité efface immédiatement l'ancien résultat. Une quantité vide, fractionnaire ou hors limites empêche la requête API et affiche un message clair. Les prix restent communautaires et indicatifs : aucun montant affiché n'est un total de caisse garanti. Le parcours Android vérifie trois unités et le rejet d'une quantité invalide.


### Canal Drive / livraison et comparaison EAN

Dans le comparateur EAN exact, le canal **Drive/livraison** n'envoie désormais **aucune requête Open Prices destinée aux prix des magasins physiques**. Il affiche les offres de l'enseigne compatibles avec le canal sélectionné, mais aucun prix ou total fictif : les relevés de rayon ou de caisse ne constituent pas des devis Drive. La couverture indique explicitement **« Prix physiques non interrogés »**, et non « Aucun relevé trouvé ». Le retour au mode magasin réactive la recherche de prix ordinaire. Le scénario est contrôlé dans le parcours Android avec un compteur d'appels réseau.

### Requêtes de prix annulables sur mobile

Pendant une comparaison lente ou approfondie, le bouton **« Annuler la recherche »** interrompt immédiatement les requêtes réseau et libère le bouton de comparaison. Une réponse tardive ne peut plus rétablir un ancien résultat : l'utilisateur peut relancer volontairement sa recherche, y compris avec une connexion Android instable.

La comparaison EAN exact annule désormais ses appels Open Prices encore actifs si le produit scanné, la quantité ou les paramètres (enseigne, canal, rayon, fidélité) changent. Une nouvelle comparaison annule également l'ancienne recherche, y compris pendant la pagination. Les recherches qui ne répondent pas dans les **18 secondes** sont interrompues pour éviter un bouton bloqué sur Android. Une annulation utilisateur n'est pas présentée comme une panne du service ; si la limite d'attente est atteinte, l'interface invite à réessayer. Ces mécanismes améliorent le confort et économisent les transferts inutiles, sans promettre un prix temps réel.

### Comparaison d'une quantité d'un même code-barres

Quand la comparaison de deux relevés locaux de l'EAN exact est possible, le comparateur présente le **prix unitaire observé**, une **projection du coût par enseigne** pour la quantité choisie et **l'écart de prix indicatif total hors promotions**. Exemple : 3 articles observés à 3,49 € contre 3,59 € donnent des projections de 10,47 € et 10,77 € : écart indicatif 0,30 €. Il ne s'agit ni d'un prix actuel garanti, ni d'un devis, ni d'une confirmation que la quantité sera disponible. Sans paire locale vérifiable ou en Drive, aucun total comparatif n'est calculé. Les remboursements et coupons restent des estimations distinctes, jamais automatiquement additionnées à cet écart.

### Relevés de prix remisés

Un ticket Open Prices signalé comme **déjà remisé** reste visible, mais ne peut pas servir à désigner l'enseigne au prix habituel le plus bas, ni à projeter un panier de plusieurs unités. Pour une quantité supérieure à un, la carte du magasin ne multiplie plus non plus le prix remisé d'un ticket individuel en un prétendu **débours avant remboursements** ; elle affiche un avertissement explicite. Le prix d'un ticket non remisé dans l'autre enseigne reste consultable et peut encore donner une estimation distincte, sans inventer de comparaison entre les deux. Si une paire plus ancienne de relevés non remisés reste récente (7 jours), proche dans le temps (3 jours) et géographiquement comparable, elle peut être retenue à la place. Les gains conditionnels ne sont jamais cumulés automatiquement avec un ticket remisé.

### Réduction des données téléchargées par comparaison

Les deux enseignes partagent les mêmes pages de recherche par GTIN dans Open Prices. Pour une comparaison EAN ou une actualisation explicite du panier, l'application **télécharge et décode chaque URL de page une seule fois**, puis **filtre séparément** les relevés Carrefour et E.Leclerc. La déduplication est limitée à l'opération en cours (aucun cache inter-produit ou durable), et respecte le même signal d'annulation pour les deux enseignes. Ainsi, une page demandée par les deux enseignes ne coûte plus deux réponses réseau identiques. Les garde-fous propres à chaque enseigne, la recherche incomplète et le choix des magasins comparables restent inchangés.

Le parcours Android contrôle la mutualisation sur deux pages paginées et vérifie les prix propres à chaque enseigne, ainsi que le nombre réel d'appels lors d'une actualisation du panier.

### Fiabilité des budgets sur une recherche paginée

L'actualisation de la liste de courses ne considère plus une réponse Open Prices HTTP 200 comme une recherche nécessairement complète : des pages peuvent rester non consultées lorsque la pagination dépasse les deux premières pages ou le seuil de pertinence. L'application distingue **recherche interrompue**, **recherche limitée aux pages consultées** et **requête indisponible** ; chacun de ces cas abaisse explicitement le niveau de confiance du budget estimé. Les relevés déjà récupérés restent visibles, mais le total ne doit pas être présenté comme un devis exhaustif ni comme une garantie d'économie. Le scénario est validé dans le parcours Android avec des pages supplémentaires annoncées par Open Prices.

### Annulation des actualisations de panier devenues obsolètes

Une actualisation des prix de la liste de courses utilise une **copie figée de la liste et des paramètres géographiques** au départ de la recherche. Si la liste (ajout, suppression ou quantité), le canal d'achat, la proximité ou le rayon change pendant la récupération, les requêtes encore en cours sont **annulées**. Les réponses de l'ancienne recherche ne peuvent plus écraser les prix affichés, même si elles arrivent après une nouvelle actualisation ; le bouton redevient disponible. Les prix réellement présents avant la recherche annulée ne sont pas remplacés par des réponses obsolètes. Un scénario fonctionnel Android simule une réponse tardive, modifie le canal pendant la recherche puis vérifie l'absence de prix périmés injectés dans le panier.

### Annuler une recherche de prix trop lente

Pendant l'actualisation de la **liste de courses**, un bouton visible **« Annuler l’actualisation »** permet d'interrompre immédiatement la recherche en cours, sans supprimer les produits, modifier le canal ou effacer les anciens prix déjà disponibles. L'actualisation active est annulée via son contrôleur réseau et les réponses tardives sont ignorées. Le bouton **« Actualiser les prix »** redevient actif pour un nouvel essai. Le parcours Android teste l'annulation manuelle pendant une réponse retardée et vérifie qu'aucun ancien résultat ne remplace le panier.

### Saisie sûre des codes-barres

La recherche accepte les EAN/UPC/GTIN composés de 8, 12, 13 ou 14 chiffres, avec éventuellement des espaces ou des tirets de présentation. Elle refuse les lettres, ponctuations et caractères de contrôle au lieu de les supprimer silencieusement : une saisie mal copiée ne peut ainsi être interprétée comme un autre produit. Les vérifications de cohérence GTIN existantes restent en place. Le formulaire ne bloque plus silencieusement la soumission par sa validation HTML native : l'application affiche elle-même l'erreur explicite. Une saisie rejetée efface la fiche et les prix précédents, désactive la comparaison et empêche toute réponse tardive d'une recherche antérieure de faire réapparaître un autre produit. Le parcours Android contrôle les préfixes incorrects, les caractères de contrôle, les tirets et l'effacement des anciens résultats.

### Recherches produit lentes sur Android

Lors de la **première recherche de produit par code-barres**, le bouton « Annuler la recherche du produit » permet d'arrêter immédiatement les requêtes Open Food Facts et Open Prices. Un nouveau scan interrompt également la recherche précédente. Une limite de **15 secondes** empêche qu'une des deux sources bloque indéfiniment le résultat : si une source a déjà répondu, sa donnée reste visible avec un avertissement de couverture partielle. Après annulation manuelle, aucun ancien résultat ne peut réapparaître et une nouvelle recherche est possible directement. Le parcours Android intercepte une requête volontairement bloquée, annule, tente une réponse tardive, puis vérifie la reprise d'une recherche normale.


## Déploiement continu de la PWA

**Activation initiale obligatoire (propriétaire/admin du dépôt) :** depuis [Settings → Pages](https://github.com/dbrckk/Promo-alimentaire/settings/pages), choisir **Build and deployment → Source → GitHub Actions**. Cette action se fait une seule fois, sans token personnel. Le journal du 11 octobre 2026 a confirmé que l'ancienne option `actions/configure-pages@v5` avec `enablement: true` ne peut **pas** créer le site via le simple `GITHUB_TOKEN` : `Resource not accessible by integration`. Ne pas déclarer la PWA publiée avant la réussite de l'étape `Deploy`.

Le workflow `Deploy PWA to GitHub Pages` se déclenche après une **CI réussie** sur `main`, ou manuellement depuis `main`. Il vérifie `npm run verify` sur **le commit exact validé** (SHA issu de `workflow_run.head_sha`), puis **construit et conserve un artefact statique** avant de tester si Pages a été configuré. En cas de site non activé (404), seul le déploiement échoue, avec les instructions dans les journaux GitHub Actions ; l'artefact reste inspectable. Après activation, relancer depuis **Actions → Deploy PWA to GitHub Pages → Run workflow → main**.

La CI s'exécute aussi une fois par jour à **08 h 33 UTC**, car les écritures effectuées par des workflows GitHub utilisant `GITHUB_TOKEN` ne déclenchent pas elles-mêmes d'autres workflows `push`. Cette validation quotidienne permet de redéployer les snapshots mis à jour, sans prétendre qu'une source inaccessible a été revalidée. Le statut de l'hébergement doit toujours être constaté dans les journaux de déploiement, et l'URL ouverte depuis un navigateur avant toute annonce de disponibilité.


### Adresse Android et vérification de publication

La PWA déployée sur GitHub Pages est disponible à [https://dbrckk.github.io/Promo-alimentaire/](https://dbrckk.github.io/Promo-alimentaire/). Depuis Android (Chrome), ouvrir l'URL puis, si proposé, utiliser **Installer l'application** dans le menu du navigateur.

Chaque build Pages contient `deployment.json` avec le **SHA du commit réellement construit**. Après `actions/deploy-pages`, le script `scripts/check-public-pages.mjs` vérifie depuis le runner GitHub, via HTTPS et avec réessais pendant la propagation CDN, que l'URL publique sert **ce commit précis**, l'interface, le JavaScript, le CSS, le manifeste installable, le service worker et le manifeste des offres. Une diffusion de fichiers obsolètes ou manquants fait échouer le workflow de publication ; une simple réussite de l'envoi de l'artefact ne suffit plus. Ce contrôle ne constitue pas un test Android physique et ne garantit pas que chaque fournisseur d'offres soit actualisé.

### Surveillance des offres expirées

Le contrôle quotidien `Offer freshness` s'exécute à **08 h 17 UTC**, après les synchronisations planifiées des commerçants et des prestataires (vers 05 h–06 h UTC) et avant la CI de 08 h 33 UTC. Un fichier dont **toutes** les offres sont expirées reste un incident de couverture de données : le contrôle strict échoue volontairement, même si l'application reste fonctionnelle et masque correctement ces offres. Cet échec n'est pas un bug technique à cacher.

Le journal et le résumé GitHub Actions indiquent désormais **la source concernée, les offres encore actives, les dates de révision et le motif enregistré lors de la dernière synchronisation** (par exemple refus d'accès Carrefour). La résolution nécessite des promotions de remplacement avec preuve officielle autorisée ; on ne prolonge ni `verifiedAt` ni `reviewAfter` artificiellement.

### Contrôle Android après la publication

Le workflow Pages lance maintenant **un parcours complet Chromium simulant un Pixel 7 sur l'URL publique**, uniquement après une publication et une vérification CDN réussies. Le parcours couvre l'ouverture de la PWA, les filtres, la recherche EAN, les offres importées, la liste et le panier, le stockage local, les erreurs réseau simulées et le fonctionnement hors ligne. Les captures d'écran sont conservées dans les artefacts GitHub Actions sous `android-live-pages-<run-id>`. Une erreur de rendu ou de navigation rend le déploiement **non entièrement validé**, même si GitHub Pages a effectivement mis le site en ligne. Cette simulation ne prétend pas remplacer un essai sur un smartphone physique.

### Filtre de fiabilité des synchronisations (11 octobre 2026)

Par défaut, la liste d'offres exclut celles qui ont un **échec récent de reconfirmation** dans les diagnostics des synchronisations publiques (notamment Coupon Network, Carrefour et E.Leclerc lorsque leurs sources sont inaccessibles). Cela évite qu'un ancien taux de remboursement non reconfirmé soit proposé comme « meilleure remise » à l'ouverture de l'application.

Le sélecteur **Fiabilité de la synchronisation** propose « Sans échec récent connu » (défaut), « Toutes, y compris non reconfirmées » et « Non reconfirmées uniquement ». Les candidates masquées ne sont **pas supprimées** : elles restent consultables à titre informatif, avec avertissement et lien vers l'offre officielle. L'état choisi est mémorisé uniquement sur cet appareil. Les statistiques parlent désormais de **remise maximale annoncée**, pas de réduction garantie. L'absence d'échec de synchronisation ne suffit jamais à garantir l'éligibilité d'un produit ou l'économie réelle.

### Fiabilité du manifeste JSON de promotions — 11 octobre 2026

Le fichier `data/import/index.json` ne peut plus demander le chargement de chemins arbitraires. Le lecteur, les contrôles GitHub Actions et le service worker limitent les entrées à **60 noms de fichiers JSON locaux**, basiques, uniques, sans `../`, sous-dossiers, paramètres d'URL ni URL distante. Les fichiers de statut et `index.json` ne sont pas des lots de promotions et sont interdits dans cette liste. Un manifeste invalide est rejeté avant tout chargement de promotions ; l'installation hors ligne reste utilisable avec ses ressources statiques existantes. Des scénarios de sécurité ont été ajoutés aux vérifications déjà présentes, y compris au parcours Android.

### Chargement du catalogue sur réseaux mobiles lents — 11 octobre 2026

La PWA utilise désormais des requêtes JSON interruptibles : 8 secondes maximum pour le manifeste, 5 secondes pour chaque diagnostic facultatif et 9 secondes par fichier de promotions. Les trois diagnostics sont demandés en parallèle, puis appliqués dans leur **ordre de priorité stable** ; les fichiers d'offres sont téléchargés par un pool de **trois connexions simultanées** au maximum. Une source indisponible est déclarée en erreur dans les diagnostics, sans bloquer les autres fichiers valides. La fusion finale continue à respecter l'ordre déclaré par le manifeste et les protections contre les identifiants dupliqués.

Ce mécanisme réduit les blocages possibles sur Android et la durée de démarrage lorsque plusieurs sources publiques sont lentes. Il ne prouve pas que les offres sont fraîches, n'autorise aucun contournement des sites commerçants et n'ajoute pas de nouvelles promotions.

### Consulter les catalogues officiels si une source est indisponible

Quand Carrefour ou E.Leclerc ne peut pas reconfirmer automatiquement les offres dans son catalogue, la rubrique **État des données importées** affiche un lien direct vers le catalogue officiel du commerçant. Ce lien est un **recours manuel**, pas une offre importée : les prix, les références, le magasin, les dates et le mode d'achat doivent être vérifiés auprès de l'enseigne. Les fiches expirées ne sont jamais réactivées grâce à ce lien.

### Limite du cache hors ligne sur Android (stabilisation)

Le service worker v82 conserve hors ligne les modules HTML/CSS/JavaScript déclarés, les fichiers d'installation et **les lots JSON explicitement inscrits dans le manifeste validé**. Il ne met plus en cache toute ressource HTTP 200 accessible sur l'origine : cela évite de remplir le stockage du téléphone avec des fichiers annexes, des chemins inattendus ou des variantes de requêtes `?...`. Les requêtes vers Open Food Facts et Open Prices restent hors du service worker.

Le manifeste téléchargé pendant l'utilisation ne remplace un manifeste hors ligne déjà bon **que si son JSON et sa liste de fichiers sont valides**. Une URL de navigation avec paramètres peut encore revenir à la coquille de la PWA en mode hors connexion. Le parcours Chrome Android existant vérifie désormais qu'un document public absent du manifeste n'est pas mis en cache, que la coquille est présente et que la liste de courses fonctionne sans réseau. Cela reste une simulation navigateur, pas une certification de tous les modèles Android.

### Couverture officielle des offres alimentaires Shopmium (11 octobre 2026)

Le synchroniseur Shopmium inspecte désormais une seule profondeur supplémentaire : **index des offres → page de campagne → fiches individuelles avec conditions officielles**. Des pages comme [Salades traiteur Bonduelle](https://offers.shopmium.com/fr/n/salades-traiteur-a-domicile-bonduelle) ou [Barilla Al Bronzo](https://offers.shopmium.com/fr/n/barilla-al-bronzo-6) contiennent plusieurs liens de remboursement et ne suffisent pas, seules, à calculer une économie. Seules les fiches comportant les pourcentages, dates, références et enseignes sont importées. Requêtes strictement limitées à l'hôte HTTPS officiel, une seule profondeur, plafond global de 110 pages et interruption en cas de refus 401/403/429. Aucun accès privé ou contournement.

Cinq fiches alimentaires officielles vérifiées le **11/10/2026** ont été ajoutées au snapshot : Bonduelle carottes râpées et taboulés (25/30/34% selon 1/2/3 articles, jusqu'au 30/12), deux opérations Barilla Al Bronzo (20/30% selon les références et quantités jusqu'au 31/10) et Daddy (20/25% selon la quantité, jusqu'au 31/10). Les EAN ne sont **pas inventés**, les remboursements dépendent du ticket, des quotas et de l'acceptation du dossier, et les offres restent **non cumulables** avec les promotions quand la fiche l'indique. Les pourcentages présentés ne sont pas des prix magasin, ni des gains garantis.

Les sources sont revérifiées **chaque jour**, ainsi qu'après modification de l'extracteur ou de la liste de veille. Les fiches non retrouvées restent au maximum jusqu'à leur **ancienne date de révision non prolongée**, sauf si la page les déclare officiellement terminées. Une synchronisation insuffisante ne remplace pas un lot fiable par une liste appauvrie.


### Publication automatique des offres synchronisées (11 octobre 2026)

Les jobs Shopmium, Coupon Network, Carrefour, E.Leclerc, La Belle Adresse et remises de paiement peuvent écrire des instantanés sur `main` via le `GITHUB_TOKEN` de GitHub Actions. Ce type de commit **ne déclenche pas** le workflow `push` CI. Le workflow **CI** écoute désormais la fin de ces synchronisations et ne se relance que si :
- la synchronisation s'est terminée avec succès sur **la branche `main` du dépôt propriétaire** ;
- le SHA courant de `main` diffère du SHA dont est parti le synchroniseur, ce qui indique un nouveau commit à contrôler.

Le code et les imports sont revérifiés par `npm run verify` sur le dernier `main`, puis le workflow Pages existant publie ce commit exact, contrôle les fichiers publics en HTTPS, et lance le parcours complet Chromium Android contre la PWA publiée. Si une source est simplement inaccessible et n'a pas écrit de nouveau commit, **aucun redéploiement inutile n'est lancé** par ce mécanisme. Un échec de CI interdit toujours la publication. L'exécution quotidienne de secours reste active à 08:33 UTC.


### Périmètre alimentaire et règle des 50 % (11 octobre 2026)

L'application est d'abord destinée aux **courses alimentaires**. Les offres d'entretien, hygiène, beauté et autres produits clairement **non alimentaires** n'apparaissent dans les résultats, calculs sur EAN ni panier que si la remise annoncée vérifiable représente **au moins 50 % du prix de référence**. Une remise fixe sans prix de base fiable ne peut pas prouver le seuil de 50 % : elle est donc masquée pour le non-alimentaire. Les bons d'achat/cashbacks qui s'appliquent à un panier de courses restent disponibles.

Les pages [Shopmium](https://offers.shopmium.com/fr/) mentionnent le **rayon** de la fiche (« Boissons pour enfants », « Douche », « Adoucissants », « Hygiène », etc.). Le synchroniseur extrait ce rayon comme preuve du domaine du produit ; l'absence d'un rayon reconnaissable n'est pas une preuve d'alimentation. Les fiches déjà répertoriées et manifestement non alimentaires ont été étiquetées en conséquence (13 fiches). Les catégories historiques « autre » restent des **candidats non classés**, à revoir avant d'y appliquer une économie. Le filtre est appliqué à l'ensemble du moteur de recherche, du rapprochement produit et du panier, et pas seulement à la liste de bons plans. Un contrôle Chromium Android vérifie cette règle sur le catalogue importé.

Le catalogue source complet demeure consultable dans `data/import/` à des fins d'audit, même lorsqu'une offre n'est pas proposée à l'achat. Un taux de 50 % indique une offre conditionnelle à vérifier ; il ne garantit ni prix en magasin ni remboursement du fournisseur.

### Classement Shopmium par rayon officiel (11 octobre 2026)

Le fournisseur affiche parfois « **A retrouver au rayon frais** », « **Au rayon cafés** », « **Au rayon ferments lactiques** » ou « **Au rayon Produits ménagers** ». L'application reconnaît désormais ces variantes (y compris les libellés intégrés à une ligne Drive) et applique le filtre convenu : **alimentaire prioritaire ; non-alimentaire visible seulement à partir de 50 % de remise attestée**. Huit offres du dernier snapshot ont été reclassées à partir de leurs pages Shopmium officielles, sans modifier leurs périodes ni leurs gains. Les cas non prouvés restent à vérifier, et aucune économie n'est devenue garantie.

### Dates et changement d'heure (stabilisation)

Les offres datées `YYYY-MM-DD` sont actives sur **toute la journée française (Europe/Paris)**, y compris lorsque l'appareil Android ou GitHub Actions utilise un autre fuseau horaire. Les offres avec heure précise conservent leurs horaires exacts, notamment la clôture anticipée d'une ODR. La PWA et ses badges de date sont synchronisés sur cette logique, y compris lors du changement d'heure. Cette correction ne reconfirme pas les offres arrivées à expiration.


### État réel des synchronisations Shopmium (11 octobre 2026)

La vérification des offres Shopmium dispose désormais de son propre diagnostic dans `data/import/source-sync-shopmium.json`, distinct des fichiers Carrefour, E.Leclerc et Coupon Network. Le dernier contrôle public confirmé dans GitHub Actions (run `38164195398`) a récupéré **47 fiches officielles actives** le 11 octobre 2026.

À chaque synchronisation, le workflow consigne le nombre de fiches effectivement reconfirmées **aujourd'hui**, la date de contrôle et l'état : `updated` (toutes confirmées), `partial` (seulement certaines), `unavailable` (aucune preuve exploitable ou erreur). Si l'extracteur échoue ou si Shopmium limite l'accès, **l'ancien snapshot n'est ni remplacé par zéro offre, ni artificiellement prolongé**. Le diagnostic est publié dans un fichier indépendant ; la PWA affiche alors « source non actualisée » et écarte les candidates non reconfirmées du filtre de fiabilité par défaut. Les fiches arrivent toujours à expiration selon **leur propre date de révision**.

Le job d'actualisation sépare les erreurs d'accès aux données commerciales des erreurs techniques du dépôt : il conserve les avertissements dans GitHub Actions et valide le code ainsi que les données avant de publier le diagnostic. La copie de ce diagnostic est incluse dans les ressources essentielles pour l'utilisation hors ligne. La présence d'un statut `updated` n'est pas une garantie d'éligibilité produit, de stock ni de remboursement en caisse.


### Fiabilité du compteur de reconfirmations Shopmium

Le compteur affiché dans `source-sync-shopmium.json` est produit à partir des **fiches réellement lues et validées pendant chaque exécution**, et non à partir du champ `verifiedAt` qui ne contient qu'une date (sans heure). Deux contrôles le même jour ne peuvent donc plus confondre une fiche ancienne conservée avec une fiche nouvellement vérifiée. Le synchroniseur transmet les nombres `confirmed_count`, `retained_count` et `snapshot_count` au gestionnaire de statut via les sorties numériques de l'étape GitHub Actions.

Si ces trois nombres manquent ou sont incohérents avec le snapshot enregistré, le statut ne peut pas annoncer `updated` : la publication s'interrompt au lieu de produire un faux bilan de vérification. Les offres conservées restent datées de leur dernière preuve réelle et le seuil de fraîcheur de la PWA n'est jamais prolongé automatiquement.

### Échéances des fichiers d'offres : même calendrier que les achats en France (12 octobre 2026)

La date « révision » et l'alerte « à revoir bientôt » dans **État des données importées** sont désormais calculées sur les seules offres actives, avec la fin de journée **Europe/Paris** pour les dates sans heure, et le jour civil français pour les échéances avec heure précise. Le nombre de jours restants correspond aux jours de calendrier français, notamment pendant les changements d'heure. Cette correction d'affichage ne renouvelle aucune campagne, ne modifie pas les montants et ne présente aucune promotion Carrefour non reconfirmée comme une économie.

### Précision alimentaire des coupons Coupon Network (12 octobre 2026)

La récupération publique des coupons ne fournit pas de rayon fiable : le snapshot utilise souvent `autre` comme catégorie. L'application attribue désormais le rayon **alimentaire** aux produits identifiables par un vocabulaire précis ; les indices explicites d'entretien, de soin, d'animalerie ou de boissons alcoolisées sont traités en premier et restent soumis à la règle **autres domaines : au moins 50 %**. Les coupons à montant fixe, sans prix d'achat vérifié, ne deviennent pas des réductions de 50 % par hypothèse. Les fiches ambiguës gardent `autre`, sans EAN inventé ni preuve d'éligibilité supplémentaire. Cette classification locale ne modifie aucune offre ni sa date et reste vérifiée dans le parcours navigateur Android.


### Contrôle quotidien : archives historiques distinctes des vraies pannes

Le contrôle strict de fraîcheur ne peut pas être utilisé si un ancien catalogue explicitement conservé pour audit fait échouer GitHub Actions tous les jours, sans lien avec les autres fournisseurs. Le manifeste `data/import/index.json` désigne maintenant par `archivedOnly` les **archives volontairement expirées**, avec justification obligatoire. Seul le snapshot des onze anciennes campagnes Carrefour est concerné. Il garde son statut visible `archived` et un avertissement ; ses promotions restent désactivées.

Un catalogue actif qui devient vide sans être déclaré archivé, un fichier d'archive manquant ou invalide, ou la réapparition d'offres actives dans une archive désignée restent des erreurs en contrôle strict. La CI vérifie aussi le scénario daté du 12 octobre qui faisait échouer l'automatisation `Offer freshness`. Les chiffres d'offres actives par enseigne ne sont pas modifiés par ce changement de supervision.


### Catalogue du jour : taux selon la quantité réellement éligible (12 octobre 2026)

Les suggestions affichent le **taux du premier palier applicable à la quantité minimale**, et non le meilleur pourcentage publicitaire indépendamment du nombre d'articles. Par exemple, une offre Shopmium « 20 % pour 1 article ; jusqu'à 30 % pour 3 » affiche **20 % sur 1** puis indique séparément **jusqu'à 30 % à partir de 3**. Une ODR fixe de 1 € nécessitant 2 articles à 2 € ne s'affiche plus comme une remise de 50 %, mais comme **25 % du lot à 4 €**. Sans prix de référence vérifiable, le pourcentage d'une ODR fixe reste inconnu.

Les simulations et les prix présentés dans le catalogue restent des **candidats conditionnels**, jamais des gains garantis en caisse. Vérifier la référence, la quantité, les modalités et la source officielle avant l'achat.


### Campagnes « Catalogue du jour » : preuves récentes (12 octobre 2026)

Une page de campagne indiquant une fin au mois prochain **ne prouve pas** que ses produits et modalités sont encore inchangés aujourd'hui. La vue quotidienne n'affiche plus une campagne éditoriale dont le dernier relevé officiel remonte à **plus de 7 jours civils en France**, même si sa date de fin annoncée est future. Les taux publicitaires hors de 0–100 % sont refusés. Une campagne non reconfirmée reste accessible via le lien général du catalogue officiel, mais ne redevient pas une promotion vérifiée sans nouvelle observation authentique. Les vrais remboursements provenant d'autres imports gardent leurs propres dates et règles de contrôle.

Ce filtre agit uniquement sur les **campagnes de découverte**, jamais en étendant artificiellement la validité des promotions produit. Des vérifications ajoutées au parcours Chromium Android attestent de la disparition d'une annonce après 7 jours sans contrôle.

Les offres dont le palier maximal s'applique **uniquement à 3 articles** sont désormais signalées « pour exactement 3 articles ». Quand la source fournit une plage (par exemple de 3 à 4), la plage entière est affichée ; « à partir de 3 » n'est utilisé que si aucun maximum n'est fixé.

### Comprendre les offres masquées par une synchronisation indisponible (13 octobre 2026)

Le « Catalogue du jour » reste une sélection **à preuves suffisantes**, et non un catalogue complet garanti. Quand un fournisseur (par exemple E.Leclerc) n'a pas pu reconfirmer sa source, ses anciennes fiches encore dans leur période de révision sont **exclues** des meilleures offres et du gain calculé. La page indique désormais combien de candidats sont masqués pour l'enseigne et le canal choisis ; elle renvoie à l'onglet **Offres** et au filtre **« Toutes, y compris non reconfirmées »** pour inspecter explicitement ces fiches et leurs liens officiels. Ces candidats ne sont ni des promotions du jour prouvées, ni des gains garantis. Les fiches réellement expirées restent exclues quel que soit le filtre.

### Synchronisation partielle Shopmium : preuves individuelles (13 octobre 2026)

Un contrôle public peut reconfirmer **45 fiches sur 46**. Auparavant, le diagnostic `partial` ne fournissait que deux compteurs : l'interface ne savait pas quelles fiches avaient été lues et pouvait masquer **toutes** les ODR Shopmium du « Catalogue du jour », y compris celles réellement reconfirmées.

Le synchroniseur transmet maintenant les **identifiants `externalId` des fiches vérifiées dans cette exécution**. Le script de diagnostic refuse une liste JSON invalide, un doublon, un nombre différent du compteur ou un identifiant absent du snapshot. La liste `confirmedExternalIds` est enregistrée uniquement lorsque la source est partielle. Le lecteur PWA et le contrôle de fraîcheur reconnaissent ces preuves individuelles : les fiches reconfirmées restent candidates aux économies du jour ; seules les fiches conservées sans nouvelle preuve reçoivent `sourceSyncWarning`.

Ce correctif ne confirme ni le stock, ni le prix en caisse, ni l'éligibilité du panier ou l'approbation du remboursement. En cas de panne complète ou de diagnostic ancien dépourvu d'identifiants, le comportement conservateur existant est maintenu.

### Catalogue du 14 octobre 2026 : analyses des promotions alimentaires officielles

La vue **Catalogue du jour** inclut maintenant quatre nouvelles campagnes alimentaires Carrefour recoupées sur `https://www.carrefour.fr/offres-du-moment` le 14 octobre : **Bons plans famille** (jusqu'à 50 % sur le deuxième article, Drive, 16 octobre), **Promos de la semaine** (jusqu'à 50 % sur le deuxième, hypermarché/Drive, 19 octobre), **Raisin Red Globe** (prix publicitaire 2,99 €/kg, magasins et Drives participants, 15 octobre) et **Semaine du goût / raclette** (jusqu'à 30 % sur le deuxième, 26 octobre). Les campagnes Bio (60 % maximum sur le deuxième) et Mois Online (50 % maximum sur le deuxième) ont été reconfirmées à la même date. Ce sont des **pistes de découverte datées**, distinctes des offres vérifiées par EAN ; elles ne modifient jamais les totaux du panier ni ne garantissent les prix locaux. L'ancien catalogue du 12 octobre reste archivé/inactif.

Pour éviter une lecture trompeuse des pourcentages publicitaires, le classement des campagnes utilise désormais un **plafond illustratif sur le lot de produits de même prix** : « -60 % sur le deuxième » signifie **au maximum -30 % sur deux articles**, et « -50 % sur le deuxième » signifie **au maximum -25 %**. Les 2+1 nécessitent trois produits de même prix (plafond 33,33 %). Le véritable taux peut être plus bas, et rien ne garantit qu'un lot soit éligible. Le raisin affiche son **prix annoncé au kilo** sans prétendre disposer d'un prix barré ni d'une remise calculable. Les prix publics et les dates doivent être revérifiés dans le catalogue du magasin sélectionné.

Chaque preuve fait l'objet d'une règle étroite associant campagne officielle, formulation, mécanisme et fin datée. Le synchroniseur ne reporte la date de preuve que si le contenu public permet de confirmer cette campagne précise. Sans nouvelle preuve, les campagnes disparaissent automatiquement de la sélection après sept jours français. La CI et le parcours Android Chrome vérifient les exclusions, le calcul sur le lot, les canaux et l'absence d'économie panier fabriquée.

### Catalogue : découverte quotidienne des sélections à petit prix (14 octobre 2026)

Le synchroniseur public `npm run sync:daily-catalogue -- --write` ne se limite plus à renouveler la preuve de campagnes préenregistrées : il analyse également les **rubriques alimentaires strictement identifiées** sur la page officielle `https://www.carrefour.fr/offres-du-moment`. Il peut retrouver les sélections **fruits et légumes à 0,99 €** et **Bio à moins de 2 €**, ainsi qu'une opération du jour **poissonnerie, 34 % d'économies Club dès 15 € en Drive** lorsqu'elle est exactement publiée. Chaque entrée réclame la présence proche de la bannière, du titre et de ses conditions. Sans preuve, aucune donnée n'est ajoutée. Les promotions ménagères génériques ou autres catégories non alimentaires ne sont pas importées comme nourriture.

Ces **annonces de sélection**, datées d'un seul jour civil français, ne contiennent ni EAN, ni prix unitaire vérifié, ni remise garantie, ni droit au cumul. Le magasin et la référence exacte restent à confirmer. Les nouvelles sélections du jour sont recalculées par la synchronisation quotidienne ; l'historique de ces leads est conservé seulement sept jours et ne ressurgit pas comme promotion active. La découverte reste dépendante de l'accessibilité officielle du site, sans contournement des refus 403/429.

Le filtre de budget du catalogue masque désormais toute annonce dont le **minimum d'achat publicitaire est supérieur au plafond choisi** (par exemple, l'opération poissonnerie dès 15 € est exclue pour 3 €). Les autres sélections sans prix unitaire demeurent des pistes, avec un avertissement explicite qu'elles **ne sont pas vérifiées compatibles avec le budget**. Les scénarios sont couverts dans le test Carrefour déjà présent et le parcours Chrome Android.

#### Résilience d'une lecture refusée (14 octobre 2026)

La tâche GitHub Actions a confirmé un refus **HTTP 403** sur la page de campagnes Carrefour. Elle ne force jamais l'accès ni ne fabrique de nouvelles vérifications. Le synchroniseur conserve désormais les annonces alimentaires **déjà observées et datées du jour** plutôt que de les effacer à chaque échec d'accès. Leur fenêtre d'exposition reste **un seul jour civil Europe/Paris** ; l'historique de ces pistes n'est conservé que sept jours, et leur date ne peut jamais être allongée par la simple absence d'une nouvelle requête réussie. Le contrôle de non-régression couvre explicitement le refus d'accès, minuit à Paris et la purge des anciennes observations.
