# Go Pay : API REST, GraphQL et gRPC de transfert d'argent

Projet du module **Développement moderne avec Python (API)** · Master 2 DATA-IA · ISM Dakar.

Ce projet regroupe les parties réalisées du TD1 et les parties A et B du TD3.

Go Pay est un service fictif de mobile money : un client envoie de l'argent depuis son wallet, le bénéficiaire le retire en espèces chez un agent avec un code à 6 chiffres, et un client peut payer un marchand affilié.

Le projet repose sur trois technologies complémentaires :

- **REST** : une API construite avec FastAPI et Pydantic v2 pour gérer les wallets et les opérations financières.
- **GraphQL** : une API en lecture seule permettant de consulter les wallets et leurs transactions.
- **gRPC** : un service interne FraudCheck permettant d'évaluer le risque de fraude associé à chaque transfert.

Les données sont conservées **en mémoire** (elles disparaissent à l'arrêt du serveur).

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
| R12 | Le transfert est refusé si le score anti-fraude atteint ou dépasse 0,8 |
| R13 | Si FraudCheck ne répond pas dans le délai de 200 ms : un transfert de moins de 50 000 FCFA est autorisé, tandis qu'un transfert de 50 000 FCFA ou plus est refusé avec HTTP 503 |

### Contrôle anti-fraude (R12 et R13)

Chaque transfert est soumis à une évaluation par le service gRPC interne FraudCheck.

- **R12 – Détection de fraude :** si le score anti-fraude retourné est supérieur ou égal à 0,8, le transfert est bloqué.
- **R13 – Indisponibilité du service :** si FraudCheck ne répond pas dans le délai de 200 ms, une règle de secours est appliquée :
  - Montant inférieur à 50 000 FCFA : le transfert est autorisé.
  - Montant supérieur ou égal à 50 000 FCFA : le transfert est refusé avec une erreur HTTP 503 (Service Unavailable).

Le contrôle de ces règles peut être effectué manuellement en testant les différents scénarios de réponse et d'indisponibilité de FraudCheck.

## Points d'accès

| Méthode et chemin | Rôle |
|---|---|
| `POST /v1/wallets` | Ouvrir un wallet client ou marchand |
| `GET /v1/wallets/{id}` | Consulter le solde et les informations |
| `POST /v1/wallets/{id}/depots` | Dépôt d'espèces chez un agent |
| `POST /v1/transferts` | Envoyer de l'argent (R1 à R5, R12 et R13) |
| `POST /v1/retraits` | Retirer en espèces avec un code (R6) |
| `POST /v1/paiements` | Payer un marchand affilié (R7) |
| `GET /v1/wallets/{id}/transactions` | Historique, page par page |
| `/graphql` | Consulter les wallets et transactions avec GraphQL |
| `GET /health` | Vérifier que l'API répond |

### Services et ports

| Service | Adresse | Description |
|---|---|---|
| API REST FastAPI | `localhost:8000` | Gestion des wallets et des opérations |
| API GraphQL | `localhost:8000/graphql` | Consultation des données en lecture seule |
| Documentation Swagger | `localhost:8000/docs` | Documentation interactive REST |
| Documentation ReDoc | `localhost:8000/redoc` | Documentation REST |
| Contrat OpenAPI | `localhost:8000/openapi.json` | Schéma de l'API REST |
| Service gRPC FraudCheck | `localhost:50051` | Évaluation du risque de fraude |

L'adresse du service gRPC est configurable grâce à la variable d'environnement `GOPAY_FRAUDE_ADRESSE`. Par défaut, FraudCheck est accessible sur `localhost:50051`.

Le service FraudCheck est appelé avec une échéance de 200 ms.

## Lancer le projet

### Prérequis

- Python
- [uv](https://docs.astral.sh/uv/)
- Git

### Installation des dépendances

Depuis le dossier racine du projet :

```powershell
uv sync
```

### Démarrage des services

Le projet nécessite deux terminaux PowerShell ouverts simultanément.

**Terminal 1 – API REST et GraphQL**

Depuis la racine du projet, exécuter :

```powershell
uv run fastapi dev src/gopay/main.py
```

L'API démarre sur le port **8000**.

- API REST : `http://127.0.0.1:8000`
- Documentation Swagger : `http://127.0.0.1:8000/docs`
- Documentation ReDoc : `http://127.0.0.1:8000/redoc`
- GraphiQL : `http://127.0.0.1:8000/graphql`

**Terminal 2 – Service gRPC FraudCheck**

Depuis la racine du projet, exécuter :

```powershell
uv run python -m gopay.fraude.serveur
```

Le service FraudCheck démarre sur le port **50051**.

Les deux services doivent fonctionner simultanément pour permettre à l'API de communiquer avec FraudCheck.

Pour configurer une autre adresse gRPC, utiliser la variable d'environnement `GOPAY_FRAUDE_ADRESSE`.

Exemple sous PowerShell :

```powershell
$env:GOPAY_FRAUDE_ADRESSE = "localhost:50051"
```

## Tests et qualité du code

Pour lancer les tests automatiques :

```powershell
uv run pytest
```

Pour vérifier le style du code :

```powershell
uv run ruff check .
```

Pour appliquer le formatage :

```powershell
uv run ruff format .
```

Pour vérifier les types :

```powershell
uv run mypy src
```

Les règles R12 et R13 peuvent également être vérifiées manuellement à travers les scénarios de fonctionnement et d'indisponibilité du service FraudCheck.

## Structure du projet

```text
go-pay/
├── pyproject.toml
├── protos/
│   └── gopay/
│       └── fraude/
│           └── fraud.proto
├── src/
│   └── gopay/
│       ├── main.py
│       ├── graphql_api.py
│       ├── schemas.py
│       ├── models.py
│       ├── repository.py
│       ├── services.py
│       ├── errors.py
│       ├── dependencies.py
│       ├── fraude/
│       │   ├── client.py
│       │   ├── serveur.py
│       │   ├── fraud_pb2.py
│       │   └── fraud_pb2_grpc.py
│       └── routers/
└── tests/
```

## Architecture du projet

Le projet adopte une architecture en couches afin de séparer les responsabilités :

- **Router :** reçoit les requêtes HTTP, valide les entrées et choisit le code de réponse HTTP.
- **Service :** applique les règles métier et orchestre les opérations.
- **Repository :** gère l'accès aux données conservées en mémoire.
- **Schemas :** définit les schémas d'entrée et de sortie avec Pydantic.
- **GraphQL :** expose les opérations de consultation en lecture seule.
- **Fraude :** contient le client gRPC, le serveur FraudCheck et le code Python généré à partir du contrat Protocol Buffers.
- **Protos :** contient le contrat `fraud.proto` qui définit les échanges entre l'API et le service FraudCheck.

Chaque couche a un seul rôle : aucune règle métier ne doit être directement implémentée dans un router.

## Choix techniques

- **FastAPI :** framework Python utilisé pour construire l'API REST.
- **Pydantic v2 :** validation et structuration des données.
- **GraphQL :** consultation des wallets et des transactions en lecture seule.
- **gRPC :** communication entre l'API et le service interne FraudCheck.
- **Protocol Buffers :** définition du contrat d'échange dans `protos/gopay/fraude/fraud.proto`.
- **Montants en `Decimal`**, jamais en `float` : les calculs d'argent sont exacts. Le FCFA n'a pas de centimes.
- **Schémas d'entrée et de sortie séparés :** le client ne peut pas envoyer ses propres frais ni son statut.
- **Erreurs normalisées** au format *Problem Details* (RFC 9457) : `422` pour les données invalides ou le solde insuffisant, `409` pour un code de retrait déjà utilisé et `503` lorsque le service anti-fraude est indisponible et que la règle R13 impose le refus.
- **Pagination par curseur** pour l'historique : stable quand de nouvelles transactions arrivent.
- **Contrat OpenAPI** généré par FastAPI à partir du code.
- **Délai de réponse gRPC de 200 ms :** permet de limiter le temps d'attente du contrôle anti-fraude et d'appliquer la règle de secours R13.

## État d'avancement

Les éléments suivants sont réalisés dans le cadre du projet :

- TD1 : API REST de transfert d'argent avec FastAPI et Pydantic.
- TD3 – Partie A : API GraphQL en lecture seule.
- TD3 – Partie B : intégration du service gRPC FraudCheck avec son contrat Protocol Buffers.

La partie C du TD3 n'est pas présentée comme terminée dans cette documentation.

## Auteure

**Awa Seyni Niass**

Master 2 DATA-IA · ISM Dakar.