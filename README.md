# POC — SaaS de clés API LLM avec paiement Mobile Money

Vente de clés API LLM via paiement Mobile Money (SebPay Collectes) et proxy **LiteLLM**.
À l'achat, un **utilisateur interne LiteLLM** est créé (dérivé du pseudo) avec une **clé liée** aux
modèles/limites du pack. L'utilisateur accède ensuite à un **dashboard** (identifiants, stats,
graphiques) et un **chatground** pour tester ses modèles.

```
[Frontend 2 écrans]  <->  [Backend Express :3000]  <->  [LiteLLM :4001] + [API Collectes SebPay]
```

## Flux utilisateur

1. **Écran Achat** : pseudo + numéro + pack → **Payer** (Mobile Money)
2. Le backend initie la collecte (réelle ou simulée) et renvoie une référence
3. À l'approbation (`approved`), le backend :
   - crée un **utilisateur interne LiteLLM** (`POST /user/new`, `user_id` dérivé du pseudo)
   - génère une **clé liée** à cet utilisateur (`POST /key/generate`) avec modèles/budget/durée du pack
4. **Écran Dashboard** : l'utilisateur voit ses identifiants (`user_id`, clé), ses stats/graphiques,
   et un **chatground** pour tester ses modèles (le coût est attribué à sa clé)

> **Règle d'or** : le frontend n'appelle jamais LiteLLM directement (sinon `ECONNREFUSED` via le
> proxy navigateur). Tout passe par le backend, qui proxifie avec la master key ou la clé utilisateur.

## Démarrage rapide

```bash
npm install
cp .env.example .env      # adapter LITELLM_URL, LITELLM_MASTER_KEY, clés SebPay
npm start                 # http://localhost:3000
```

Prérequis : un proxy LiteLLM démarré sur `LITELLM_URL` avec `LITELLM_MASTER_KEY`.

> **Modèles** : les packs (`packs.json`) listent les modèles autorisés. Ils **doivent** exister côté
> proxy LiteLLM (sinon le chat renvoie « Invalid model name »). Liste les modèles dispo via
> `curl http://localhost:4001/v1/models -H "Authorization: Bearer <master_key>"`.

## Variables d'environnement

| Variable                 | Défaut                          | Rôle |
|--------------------------|---------------------------------|------|
| `PAYMENT_MODE`           | `simulate`                      | `simulate` (auto-approbation 5s) ou `live` |
| `SIMULATE_APPROVE_MS`    | `5000`                          | Délai d'auto-approbation en mode simulate |
| `COLLECTES_API_URL`      | `https://newapi.sebpay.bj/api/v1` | Base URL SebPay |
| `COLLECTES_PUBLIC_KEY`   | —                               | Clé publique SebPay (mode live) |
| `COLLECTES_SECRET_KEY`   | —                               | Clé secrète SebPay (mode live) |
| `LITELLM_URL`            | `http://localhost:4000`         | URL du proxy LiteLLM |
| `LITELLM_MASTER_KEY`     | —                               | Master key LiteLLM (user/new + key/generate) |
| `PORT`                   | `3000`                          | Port du backend |

## API du backend

| Méthode | Route                              | Description |
|---------|------------------------------------|-------------|
| GET     | `/api/health`                      | État + mode de paiement |
| GET     | `/api/packs`                       | Liste des packs |
| POST    | `/api/collections/initiate`        | `{ packId, phone, pseudo }` → initie, renvoie `external_reference` |
| GET     | `/api/collections/status/:ref`     | Statut ; si `approved` : crée user+clé LiteLLM, renvoie `{ key, user_id, user_alias, models }` |
| POST    | `/api/webhook/collectes`           | Webhook SebPay (optionnel) |
| GET     | `/api/key-info/:key`               | Solde, budget, modèles, expiration |
| GET     | `/api/key-usage/:key?limit=10`     | Derniers logs de dépense |
| GET     | `/api/key-spend-daily/:key?days=7` | Coût agrégé par jour |
| POST    | `/api/chat`                        | `{ key, model, messages }` → `{ ok, content, model, usage }` (proxy chat completions) |

### `POST /api/collections/initiate`
Body : `{ "packId": "pro", "phone": "22997000000", "pseudo": "Jean Dupont" }`
Le `pseudo` est **requis** (400 sinon). Il sert à dériver le `user_id` LiteLLM (`jean-dupont-ab12`).

### `POST /api/chat`
Body : `{ "key": "sk-...", "model": "gpt-oss-120b", "messages": [{"role":"user","content":"Hi"}] }`
Le backend appelle `POST ${LITELLM_URL}/v1/chat/completions` avec la **clé utilisateur**
(`Authorization: Bearer <key>`) : le spend est ainsi attribué à l'utilisateur, pas à la master key.

## Packs (`packs.json`)

Champs : `id, name, price, currency, models, max_budget, duration, rpm_limit, tpm_limit, features`.
Les `models` doivent correspondre aux noms configurés sur le proxy LiteLLM.

## Sécurité (POC → production)

- ⚠️ Stockage en mémoire : remplacer par SQLite/PostgreSQL
- ⚠️ Aucune authentification applicative : ajouter sessions/JWT et lier clé↔utilisateur connecté
- ⚠️ CORS `*` : restreindre au domaine en production
- ⚠️ Mot de passe UI LiteLLM non géré (l'utilisateur s'authentifie via sa clé dans ce POC)
- ✅ Master key LiteLLM et clés SebPay restent côté serveur

## Notes

- Le `user_id` LiteLLM est suffixé d'un short random pour rester unique entre deux achats du même pseudo
- Le `key_alias` (`pack-<id>-<ref>`) doit aussi être unique côté LiteLLM
- `key-info` peut renvoyer `models:[]` selon le proxy (New API) ; le dashboard utilise alors les
  modèles du pack (passés dans la réponse `status`) pour remplir le sélecteur du chatground
