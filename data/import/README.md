# Ingestion d'offres

Ce dossier reçoit les snapshots JSON destinés à alimenter le registre après vérification.

## Règle principale

Un EAN/GTIN ne devient **exact** que s'il est :

1. syntaxiquement valide ;
2. valide au checksum GTIN ;
3. accompagné d'une URL HTTPS qui permet de retracer l'éligibilité de cette référence.

Une simple ressemblance de nom ou de marque reste une correspondance heuristique dans `productMatch`.

## Format JSON

Chaque fichier `*.json` contient un tableau d'offres ou un objet `{"offers":[]}`.

Champs minimaux :

```json
{
  "providerId": "source",
  "externalId": "identifiant-source",
  "title": "Titre de l'offre",
  "stores": ["carrefour", "leclerc"],
  "savingPercent": 40,
  "verifiedAt": "2026-10-07",
  "startsAt": "2026-10-01",
  "expiresAt": "2026-10-31",
  "sourceUrl": "https://source.example/offre",
  "eans": ["4006381333931"],
  "eanEvidenceUrl": "https://source.example/preuve-reference"
}
```

## Validation locale / CI

```bash
npm run validate:imports
```

Le validateur refuse notamment :

- checksum GTIN incorrect ;
- EAN exact sans preuve ;
- URL non HTTPS ;
- enseigne inconnue ;
- économie négative ou supérieure à 100 % ;
- date de début postérieure à la fin ;
- identifiant dupliqué dans un même lot.

Le dossier peut rester sans fichier JSON tant qu'aucun lot vérifié n'est prêt.
