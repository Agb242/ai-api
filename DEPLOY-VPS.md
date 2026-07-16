# 🚀 Déploiement LiteLLM sur VPS (sécurisé)

Guide de déploiement de ton proxy LiteLLM (NVIDIA NIM) sur un VPS public, avec HTTPS, pare-feu et exposition sécurisée des ports.

> **Stack** : LiteLLM Proxy (main-stable) + Postgres + Redis + Caddy (reverse proxy HTTPS) + le backend POC Node.js.

---

## ⚠️ 0. Avertissements sécurité CRITIQUES (à lire avant tout)

Avant de mettre LiteLLM sur internet, tu **dois** corriger ces points issus de ta config locale :

| Secret | Valeur actuelle (locale) | Action VPS |
|---|---|---|
| `LITELLM_MASTER_KEY` | `sk-liteolnkjbsv245kbcv24` | 🔴 **RÉGÉNÉRER** — trop court, devinable, déjà utilisé |
| `POSTGRES_PASSWORD` | `ytfkukjfyt23` | 🔴 **RÉGÉNÉRER** — trop court pour internet |
| `NVIDIA_NIM_API_KEY` | `nvapi-4EbJp8...LSYwJ` | ✅ Réutiliser (ta clé personnelle) |
| `UI_PASSWORD` | `sk-liteolnkjbsv245kbcv24` | 🔴 **RÉGÉNÉRER** (utiliser un vrai mot de passe) |
| `LOBECHAT_ACCESS_CODE` | `cgelhjvct243gv` | 🟡 Renouveler recommandé |

**Règles d'or** :
- 🔒 Ne **JAMAIS** exposer publiquement les ports Postgres (5432) ni Redis (6379) — ils doivent rester internes au réseau Docker.
- 🔒 LiteLLM ne doit **pas** être exposé directement sur le port 4000/4001 en HTTP. Tout passe par un reverse proxy HTTPS (Caddy).
- 🔒 Le pare-feu n'ouvre que : **22 (SSH), 80, 443**.

---

## 1. Prérequis

### 1.1 Le VPS
- **OS** : Ubuntu 22.04 LTS ou Debian 12 (recommandé)
- **RAM** : 4 Go minimum (8 Go recommandé pour LiteLLM + Postgres + Redis + LobeChat)
- **CPU** : 2 vCPU minimum
- **Disque** : 40 Go
- **Accès** : SSH en root ou utilisateur sudo

### 1.2 Le nom de domaine (fortement recommandé)
Pour avoir du vrai HTTPS (requis pour un SaaS crédible), pointe **deux sous-domaines** vers l'IP de ton VPS :

| Sous-domaine | Rôle |
|---|---|
| `litellm.tondomaine.com` | API LiteLLM + UI admin |
| `app.tondomaine.com` | Ton POC (landing + dashboard + chatground) |

Dans ton registrar (OVH, Namecheap, Gandi…) : crée 2 enregistrements **A** pointant vers l'IP publique du VPS.

> Sans domaine : Caddy peut fonctionner en HTTP/IP-only mais **sans HTTPS** (navigateurs bloqueront). Un domaine coûte ~10€/an — c'est indispensable pour un SaaS.

---

## 2. Sécurisation de base du VPS

Connecte-toi en SSH puis :

```bash
# Mise à jour
apt update && apt upgrade -y

# Pare-feu : n'ouvrir QUE SSH, HTTP, HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose

# (Optionnel mais recommandé) fail2ban contre le brute-force SSH
apt install -y fail2ban
systemctl enable --now fail2ban
```

**Désactiver le login SSH par mot de passe** (clé uniquement) — édite `/etc/ssh/sshd_config` :
```
PasswordAuthentication no
PermitRootLogin no
```
Puis `systemctl restart ssh`.

---

## 3. Installation de Docker + Docker Compose

```bash
# Installer Docker (script officiel)
curl -fsSL https://get.docker.com | sh

# Ajouter ton user au groupe docker (évite sudo à chaque commande)
usermod -aG docker $USER
newgrp docker

# Vérifier
docker --version
docker compose version
```

---

## 4. Génération des secrets (NOUVELLES valeurs fortes)

**Sur le VPS**, génère des secrets frais :

```bash
echo "LITELLM_MASTER_KEY=sk-$(openssl rand -hex 24)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"
echo "UI_PASSWORD=$(openssl rand -base64 18)"
echo "LOBECHAT_ACCESS_CODE=$(openssl rand -hex 8)"
```

👉 Note ces valeurs générées. On les utilise dans le `.env` ci-dessous. **Ne réutilise pas** les anciennes.

---

## 5. Fichiers de configuration

Crée un dossier de déploiement :

```bash
mkdir -p ~/litellm-deploy && cd ~/litellm-deploy
```

### 5.1 `.env`

```bash
nano .env
```

```env
# ===== Secrets (valeurs générées à l'étape 4) =====
LITELLM_MASTER_KEY=sk-REMPLACER_PAR_VALEUR_GÉNÉRÉE
POSTGRES_PASSWORD=REMPLACER_PAR_VALEUR_GÉNÉRÉE
UI_USERNAME=admin
UI_PASSWORD=REMPLACER_PAR_VALEUR_GÉNÉRÉE

# ===== Ta clé NVIDIA NIM (réutilise la tienne) =====
NVIDIA_NIM_API_KEY=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

# ===== LobeChat (optionnel) =====
LOBECHAT_ACCESS_CODE=REMPLACER_PAR_VALEUR_GÉNÉRÉE

# ===== Domaines (pour Caddy HTTPS) =====
LITELLM_DOMAIN=litellm.tondomaine.com
APP_DOMAIN=app.tondomaine.com
```

### 5.2 `config.yaml` (tes modèles NVIDIA actuels)

```bash
nano config.yaml
```

```yaml
# config.yaml — LiteLLM Proxy (NVIDIA NIM uniquement)
# La clé NVIDIA_NIM_API_KEY est lue automatiquement depuis l'environnement
model_list:
  - model_name: llama-3.3-70b
    litellm_params:
      model: nvidia_nim/meta/llama-3.3-70b-instruct

  - model_name: gpt-oss-120b
    litellm_params:
      model: nvidia_nim/openai/gpt-oss-120b

  - model_name: nemotron
    litellm_params:
      model: nvidia_nim/nvidia/llama-3.3-nemotron-super-49b-v1

  - model_name: gpt-oss-20b
    litellm_params:
      model: nvidia_nim/openai/gpt-oss-20b

general_settings:
  enable_jwt_auth: false

litellm_settings:
  drop_params: true
  set_verbose: false
  cache: true
  cache_params:
    type: redis
    host: redis
    port: 6379
    password: ""
```

### 5.3 `docker-compose.yml` (adapté VPS — sécurisé)

Différences clés avec ta version locale :
- ❌ **Postgres et Redis n'exposent aucun port** vers l'extérieur
- ❌ LiteLLM n'est **pas** publié sur l'hôte (port 4001 supprimé)
- ✅ Un service **Caddy** gère le HTTPS et proxifie vers LiteLLM + le POC

```bash
nano docker-compose.yml
```

```yaml
services:
  # ===== Reverse proxy HTTPS (Caddy — HTTPS automatique Let's Encrypt) =====
  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"    # HTTP (redirigé vers HTTPS + challenge Let's Encrypt)
      - "443:443"  # HTTPS
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      - LITELLM_DOMAIN=${LITELLM_DOMAIN}
      - APP_DOMAIN=${APP_DOMAIN}
    depends_on:
      - litellm
      - poc-app

  # ===== LiteLLM Proxy =====
  litellm:
    image: ghcr.io/berriai/litellm-database:main-stable
    container_name: litellm-proxy
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql://litellm:${POSTGRES_PASSWORD}@postgres:5432/litellm
    volumes:
      - ./config.yaml:/app/config.yaml:ro
    command: ["--config", "/app/config.yaml", "--port", "4000"]
    # PAS de section "ports" → non exposé directement (Caddy proxifie)
    depends_on:
      - redis
      - postgres

  # ===== Ton backend POC (Node.js) =====
  poc-app:
    build: ./poc
    container_name: poc-app
    restart: unless-stopped
    environment:
      - PAYMENT_MODE=simulate
      - LITELLM_URL=http://litellm:4000
      - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
      - PORT=3000
    # PAS de "ports" → Caddy proxifie
    depends_on:
      - litellm

  # ===== Postgres (interne uniquement) =====
  postgres:
    image: postgres:16-alpine
    container_name: litellm-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: litellm
      POSTGRES_USER: litellm
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    # PAS de "ports" → inaccessible depuis l'extérieur ✅

  # ===== Redis (interne uniquement) =====
  redis:
    image: redis:7-alpine
    container_name: litellm-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    # PAS de "ports" → inaccessible depuis l'extérieur ✅

  # ===== LobeChat (optionnel) =====
  lobechat:
    image: lobehub/lobe-chat
    container_name: lobechat
    restart: unless-stopped
    environment:
      OPENAI_API_KEY: ${LITELLM_MASTER_KEY}
      OPENAI_PROXY_URL: http://litellm:4000/v1
      ACCESS_CODE: ${LOBECHAT_ACCESS_CODE}
    depends_on:
      - litellm

volumes:
  postgres_data:
  redis_data:
  caddy_data:
  caddy_config:
```

### 5.4 `Caddyfile` (configuration HTTPS automatique)

```bash
nano Caddyfile
```

```caddyfile
# HTTPS automatique via Let's Encrypt (Caddy gère les certificats tout seul)

# ----- API LiteLLM + UI admin -----
# Bloque /ui (panneau admin) sauf IP autorisée, laisse /v1/* et /key/* ouverts
{$LITELLM_DOMAIN} {
	# Protéger l'UI admin : n'y autoriser que ton IP fixe (remplace 1.2.3.4)
	@ui path /ui /ui/*
	handle @ui {
		@blocked not remote_ip 1.2.3.4
		handle @blocked {
			respond "Accès interdit" 403
		}
		reverse_proxy litellm:4000
	}

	# Le reste (API /v1, /key/generate…) : accessible avec clé
	reverse_proxy litellm:4000

	# Logs
	log {
		output file /data/litellm-access.log
	}
}

# ----- Ton POC (landing + dashboard + chatground) -----
{$APP_DOMAIN} {
	reverse_proxy poc-app:3000
	log {
		output file /data/app-access.log
	}
}
```

> **Sans domaine** (IP uniquement), remplace les blocs `{$DOMAIN}` par `:80` dans le Caddyfile (pas de HTTPS).

---

## 6. Déployer le POC backend (conteneurisé)

Crée un `Dockerfile` dans le POC pour qu'il tourne dans le même réseau Docker que LiteLLM (ainsi il appelle `http://litellm:4000`, toujours OK) :

```bash
mkdir -p ~/litellm-deploy/poc
```

Copie ton code POC dans `~/litellm-deploy/poc/` (`server.js`, `package.json`, `packs.json`, `public/`).

Puis crée `~/litellm-deploy/poc/Dockerfile` :

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Et un `~/litellm-deploy/poc/.dockerignore` :
```
node_modules
.env
```

---

## 7. Démarrage

```bash
cd ~/litellm-deploy

# Démarrer tout
docker compose up -d

# Suivre les logs (attendre "Application startup complete" de litellm)
docker compose logs -f litellm
# (Ctrl+C pour quitter les logs)
```

**Vérifier que tout est OK** (remplace par ton domaine) :

```bash
# 1. Health LiteLLM
curl https://litellm.tondomaine.com/health/liveliness
# attendu : "I'm alive!"

# 2. Modèles (avec ta NOUVELLE master key)
curl https://litellm.tondomaine.com/v1/models \
  -H "Authorization: Bearer sk-NOUVELLE_MASTER_KEY"
# attendu : liste des 4 modèles NVIDIA

# 3. Ton POC
curl https://app.tondomaine.com/api/health
# attendu : {"status":"ok",...}
```

---

## 8. Test du flux complet (achat → chat)

```bash
# Achat (mode simulate = auto-approuvé)
curl -X POST https://app.tondomaine.com/api/collections/initiate \
  -H "Content-Type: application/json" \
  -d '{"packId":"pro","phone":"22997000000","pseudo":"VPS Test"}'

# (récupère external_reference, attends 6s, puis :)
curl https://app.tondomaine.com/api/collections/status/<REFERENCE>
# → status approved + clé

# Chat avec la clé reçue
curl -X POST https://app.tondomaine.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"key":"<CLÉ>","model":"llama-3.3-70b","messages":[{"role":"user","content":"Bonjour"}]}'
# → réponse réelle du modèle
```

---

## 9. Maintenance

### Voir les logs
```bash
docker compose logs -f litellm     # proxy
docker compose logs -f poc-app     # ton POC
docker compose logs -f caddy       # reverse proxy / accès
```

### Mettre à jour LiteLLM
```bash
cd ~/litellm-deploy
docker compose pull litellm
docker compose up -d litellm
```

### Sauvegarder la DB (Postgres)
```bash
docker exec litellm-postgres pg_dump -U litellm litellm > backup_$(date +%F).sql
```
→ À automatiser via cron (ex: sauvegarde quotidienne sur un bucket S3).

### Redémarrer un service
```bash
docker compose restart litellm
```

---

## 10. Schéma réseau final (sécurisé)

```
Internet (HTTPS :443)
      │
      ▼
┌─────────────────────────────────────────────┐
│  VPS (ufw : 22, 80, 443 uniquement)         │
│                                             │
│   ┌─────────┐                               │
│   │ Caddy   │  ← HTTPS auto (Let's Encrypt) │
│   │ :443    │                               │
│   └────┬────┘                               │
│        ├── app.tondomaine.com  → poc-app    │
│        └── litellm.tondomaine.com → litellm │
│                                             │
│   Réseau Docker interne (inaccessible) :    │
│   litellm:4000 · postgres:5432 · redis:6379 │
└─────────────────────────────────────────────┘
```

- ✅ Seuls **80/443** sont ouverts sur internet
- ✅ Postgres/Redis **inaccessibles** depuis l'extérieur
- ✅ **HTTPS automatique** (Caddy + Let's Encrypt)
- ✅ UI admin LiteLLM **restreinte à ton IP**

---

## 11. Checklist de mise en production

- [ ] VPS durci (ufw, SSH par clé, fail2ban)
- [ ] Secrets **régénérés** (master key, postgres, UI password)
- [ ] Domaines pointent vers le VPS (DNS A)
- [ ] `.env` rempli avec les **nouvelles** valeurs
- [ ] `config.yaml` = tes modèles NVIDIA
- [ ] `Caddyfile` : IP autorisée pour `/ui` mise à jour
- [ ] `docker compose up -d` sans erreur
- [ ] `https://litellm.tondomaine.com/health/liveliness` → "I'm alive!"
- [ ] `https://app.tondomaine.com` → landing page du POC
- [ ] Test achat + chat → réponse réelle du modèle
- [ ] Sauvegarde DB cron planifiée
- [ ] `.env` **jamais commité** dans git (ajouter au `.gitignore`)

---

## 🔐 Rappel sur tes valeurs NVIDIA

| Clé | Valeur | Statut VPS |
|---|---|---|
| `NVIDIA_NIM_API_KEY` | `nvapi-4EbJp8...LSYwJ` | ✅ Réutiliser (ta clé) |
| `LITELLM_MASTER_KEY` | `sk-liteolnkjbsv245kbcv24` | 🔴 **Régénérer** (`openssl rand -hex 24`) |
| `POSTGRES_PASSWORD` | `ytfkukjfyt23` | 🔴 **Régénérer** (`openssl rand -hex 16`) |

> La clé NVIDIA est **valide** (testée : 121 modèles accessibles, chat fonctionne). Ne la partage jamais publiquement.
