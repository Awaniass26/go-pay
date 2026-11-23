# Go Pay — API multicanal

Projet du module **Développement moderne avec Python (API)**, Master 2 DATA-IA, ISM Dakar. Go Pay est une démonstration de portefeuille mobile : dépôts, transferts, retraits, paiements marchands et notifications.

Le dépôt réunit l’API REST du TD1 et les trois parties du TD3 : GraphQL, gRPC/Protocol Buffers et notifications temps réel. Les données sont conservées en mémoire et sont réinitialisées au redémarrage de l’API.

## Fonctionnalités

- **REST — FastAPI et Pydantic** : wallets client/marchand, dépôts, transferts, retraits à code unique, paiements et historique paginé par curseur.
- **GraphQL — Strawberry** : lecture des wallets et transactions sur `/graphql`, avec limite de résultats et DataLoader pour regrouper le chargement des wallets.
- **gRPC — FraudCheck** : évaluation du risque avant transfert, seuil de blocage de 0,8 et délai de 200 ms. En cas d’indisponibilité, les transferts sous 50 000 FCFA passent ; ceux à partir de 50 000 FCFA échouent en `503`.
- **Temps réel** : WebSocket `/ws/agents/{agent_id}` pour les alertes de transfert (sans code de retrait), SSE `/v1/transferts/{id}/suivi` pour suivre le statut, et webhooks de paiement signés HMAC-SHA256.
- **Interface React** : tableau de bord client pour le solde, les opérations, l’historique et le suivi SSE ; espace marchand pour les paiements reçus et la configuration du webhook.

Les frais de transfert sont de 1 % avec un minimum de 50 FCFA. Le wallet expéditeur est débité du montant et des frais. Les paiements marchands n’ont pas de frais.

## Architecture

```text
Frontend React / Vite ── REST + SSE ──┐
                                      ├── FastAPI ── Service métier ── Repository mémoire
Analystes ─────────────── GraphQL ─────┘                    │
                                                           ├── Client gRPC ── FraudCheck
Agents ───────────────────── WebSocket ────────────────────┘
Marchands ◀──────── Webhooks HTTP signés après paiement ────┘
```

- `src/gopay/routers/` reçoit les requêtes et appelle les services métier.
- `src/gopay/services.py` porte les règles métier ; `repository.py` gère le stockage en mémoire.
- `graphql_api.py` expose les lectures GraphQL ; `fraude/` contient le client, le serveur et le code généré gRPC.
- `temps_reel.py` gère WebSocket et SSE ; `webhooks.py` signe et envoie les événements.
- `frontend/src/` contient les tableaux de bord React. Vite transmet `/api/*` à l’API locale et retire le préfixe `/api`.

## Prérequis et démarrage

Prérequis : Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js et npm.

À la racine du dépôt :

```powershell
uv sync
```

Lancer l’API et FraudCheck dans deux terminaux :

```powershell
uv run fastapi dev src/gopay/main.py
```

```powershell
uv run python -m gopay.fraude.serveur
```

Dans un troisième terminal, lancer l’interface :

```powershell
cd frontend
npm ci
npm run dev
```

Ouvrir l’adresse locale affichée par Vite. La documentation REST se trouve sur `http://127.0.0.1:8000/docs`, GraphiQL sur `http://127.0.0.1:8000/graphql` et l’état de santé sur `http://127.0.0.1:8000/health`.

Le service gRPC écoute par défaut sur `localhost:50051`. Pour changer son adresse :

```powershell
$env:GOPAY_FRAUDE_ADRESSE = "localhost:50051"
```

Le marchand de démonstration `marchand_demo.py` reçoit les webhooks sur le port 8002. Définir `MARCHAND_SECRET` avec le secret communiqué par l’API, puis lancer `uv run fastapi dev marchand_demo.py --port 8002`. L’hôte du webhook doit être autorisé par `GOPAY_WEBHOOK_HOSTS` (par défaut `localhost,127.0.0.1`). `agent_demo.py` est un client WebSocket de démonstration.

## Routes principales

| Méthode / chemin | Usage |
|---|---|
| `POST /v1/wallets` | Créer un wallet client ou marchand |
| `GET /v1/wallets/{id}` | Lire un wallet et son solde |
| `POST /v1/wallets/{id}/depots` | Déposer des fonds |
| `POST /v1/transferts` | Créer un transfert et son code de retrait |
| `POST /v1/retraits` | Retirer avec le code et le téléphone bénéficiaire |
| `POST /v1/paiements` | Payer un marchand |
| `GET /v1/wallets/{id}/transactions` | Lire l’historique paginé (`limit`, `cursor`) |
| `PUT /v1/marchands/{id}/webhook` | Enregistrer une URL de webhook |
| `GET /v1/transferts/{id}/suivi` | Suivre le statut par SSE |
| `WS /ws/agents/{agent_id}` | Recevoir les alertes agent par WebSocket |
| `/graphql` | Explorer wallets et transactions en lecture seule |

## Vérifications

```powershell
uv run pytest
uv run ruff check .
uv run mypy src tests
```

Pour construire le frontend :

```powershell
cd frontend
npm run build
```

La suite contient dix tests : trois tests GraphQL et sept tests d’intégration anti-fraude, WebSocket, SSE et webhooks (`tests/test_graphql.py`, `tests/test_td3.py`).

## Avancement et limites

Les chemins principaux des parties A, B et C et leurs tests associés sont présents. L’interface utilise un identifiant de wallet enregistré dans le navigateur pour faciliter la démonstration ; ce mécanisme n’est pas une authentification. Le stockage mémoire et l’absence d’authentification rendent ce projet adapté à un TD local, pas à un service de paiement en production.

## Auteure

**Awa Seyni Niass** — Master 2 DATA-IA, ISM Dakar.
