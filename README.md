# Go Pay : API REST de transfert d'argent

Projet du module **Développement moderne avec Python (API)** · Master 2 DATA-IA · ISM Dakar · TD1.

Go Pay est un service fictif de mobile money comme wave : un client envoie de l'argent depuis son wallet, le
bénéficiaire le retire en espèces chez un agent avec un code à 6 chiffres, et un client peut payer un
marchand affilié. L'API est construite avec **FastAPI** et **Pydantic v2**. Les données sont
conservées **en mémoire** (elles disparaissent à l'arrêt du serveur).

## Règles métier

| Règle | Détail |
|---|---|
| R1 | Montant minimum d'un transfert : 100 FCFA |
| R2 | Frais : 1 % du montant, avec un minimum de 50 FCFA |
| R3 | Le wallet de l'expéditeur est débité du montant + frais |
| R4 | Le transfert est refusé si le solde est insuffisant |
| R5 | Chaque transfert génère un code de retrait à 6 chiffres |
| R6 | Un code de retrait ne sert qu'une seule fois |
| R7 | Paiement chez un marchand affilié : débit du client, crédit du marchand, sans frais |

## Points d'accès

| Méthode et chemin | Rôle |
|---|---|
| `POST /v1/wallets` | Ouvrir un wallet client ou marchand |
| `GET /v1/wallets/{id}` | Consulter le solde et les informations |
| `POST /v1/wallets/{id}/depots` | Dépôt d'espèces chez un agent |
| `POST /v1/transferts` | Envoyer de l'argent (R1 à R5) |
| `POST /v1/retraits` | Retirer en espèces avec un code (R6) |
| `POST /v1/paiements` | Payer un marchand affilié (R7) |
| `GET /v1/wallets/{id}/transactions` | Historique, page par page |
| `GET /health` | Vérifier que l'API répond |

La documentation interactive est générée automatiquement : `/docs` (Swagger UI), `/redoc` et `/openapi.json`.

## Lancer le projet

Prérequis : [uv](https://docs.astral.sh/uv/) (il installe aussi Python 3.12) et Git.

```bash
uv sync                                   # installe Python et les bibliothèques
uv run fastapi dev src/gopay/main.py      # démarre le serveur sur http://127.0.0.1:8000
```

## Tests et qualité du code

```bash
uv run pytest            # tests automatiques
uv run ruff check .      # style du code
uv run ruff format .     # mise en forme
uv run mypy src          # vérification des types
```

## Structure du projet

```
go-pay/
├── pyproject.toml        configuration du projet
├── src/gopay/
│   ├── main.py           création de l'application
│   ├── schemas.py        schémas d'entrée et de sortie (Pydantic)
│   ├── models.py         objets métier
│   ├── repository.py     stockage en mémoire
│   ├── services.py       règles métier R1 à R7
│   ├── errors.py         erreurs au format Problem Details
│   ├── dependencies.py   injection de dépendances
│   └── routers/          routes HTTP (wallets, opérations)
└── tests/                tests de l'API
```

Chaque couche a un seul rôle : le **router** lit la requête et choisit le code HTTP, le **service**
applique les règles métier, le **repository** accède aux données. Aucune règle métier dans un router.

## Choix techniques

- **Montants en `Decimal`**, jamais en `float` : les calculs d'argent sont exacts. Le FCFA n'a pas de centimes.
- **Schémas d'entrée et de sortie séparés** : le client ne peut pas envoyer ses propres frais ni son statut.
- **Erreurs normalisées** au format *Problem Details* (RFC 9457) : `422` pour les données invalides ou le solde
  insuffisant, `409` pour un code de retrait déjà utilisé.
- **Pagination par curseur** pour l'historique : stable quand de nouvelles transactions arrivent.
- **Contrat OpenAPI** généré par FastAPI à partir du code.

## Auteure

Awa Seyni Niass · Master 2 DATA-IA, ISM Dakar.
