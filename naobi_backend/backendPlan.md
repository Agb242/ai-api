# 🚀 Plan de Développement Backend "GTM knotflowai"

## Phase 1 : Infrastructure & Identity Foundation (JOURS 1-3)

### **Tâche 1.1 : Setup & Core Models**

* **Détails :** Initialisation du projet et mise en place de l'ORM pour la hiérarchie GTM.
* **Tables :** `Users` à `Tasks`.
* **Sous-tâches :**

1. Setup Koa + TypeScript + Objection/Knex.
2. Configuration des pools de connexion (Postgres, Redis).
3. Exécution des migrations (Users, Projects, GTM Structure).
4. Création des classes de modèles Objection.js avec `relationMappings` (ex: `Task` belongs to `Phase`, `Phase` belongs to `Initiative`).

### **Tâche 1.2 : Auth & Multi-Tenancy Service**

* **Détails :** Isolation des données par projet et accès sécurisé.
* **Tables :** `Users`, `Sessions`, `ProjectMembers`.
* **Sous-tâches :**

1. Service Auth Passwordless (OTP + JWT).
2. Middleware `projectAccess` : Vérifie si l'utilisateur possède le rôle requis (`admin`/`member`) sur le `project_id` demandé.
3. Service d'Invitation : Génération de liens pour rejoindre un projet GTM.

---

## Phase 2 : Le Moteur de Planification "Gantt Logic" (JOURS 4-7)

### **Tâche 2.1 : CRUD Hiérarchique & Ordonnancement**

* **Détails :** Gestion de la structure arborescente du tableau.
* **Tables :** `Initiatives`, `Phases`, `Tasks`.
* **Sous-tâches :**

1. API de création de structure (Créer une Initiative avec ses Phases par défaut).
2. Logique de `sort_order` : Réordonnancement par Drag & Drop des tâches.
3. Système de "Statuts" : Transitions d'état (`NOT STARTED` -> `IN PROGRESS` -> `DONE`).

### **Tâche 2.2 : Moteur de Calcul de Dates (The Scheduler)**

* **Détails :** Gestion de la timeline dynamique sans IA.
* **Tables :** `Tasks`, `TaskDependencies`.
* **Sous-tâches :**

1. Service de Dépendances : Créer des liens "Finish-to-Start" entre les tâches.
2. **Auto-Scheduling :** Algorithme de propagation. Si la tâche "Conception" glisse de 2 jours, toutes les tâches dépendantes (`TaskDependencies`) sont décalées automatiquement en base de données via une transaction atomique.

---

## Phase 3 : Real-Time Collaboration & Budget (JOURS 8-11)

### **Tâche 3.1 : Couche Temps Réel (Redis Pub/Sub)**

* **Détails :** Synchronisation immédiate du Gantt entre les utilisateurs.
* **Sous-tâches :**

1. Setup Socket.io avec l'adaptateur Redis.
2. Événements de "Broadcast" : Notifier tous les membres d'un projet lorsqu'une tâche change de statut ou de date.
3. **Presence Service (Redis) :** Afficher qui travaille actuellement sur quelle phase du GTM pour éviter les conflits d'édition.

### **Tâche 3.2 : Moteur Financier & KPIs**

* **Détails :** Agrégation des coûts et suivi de la performance.
* **Tables :** `Tasks` (champ budget), `Initiatives` (champ kpis).
* **Sous-tâches :**

1. Service d'Agrégation : Calcul en temps réel du budget total consommé par Initiative (Somme récursive des tâches).
2. KPI Tracker : Système de mise à jour des indicateurs de performance (ex: Taux d'exécution global basé sur les tâches `DONE`).

---

## Phase 4 : Module IA Optionnel & Webhooks (JOURS 12-14)

### **Tâche 4.1 : IA Strategy Pattern (Plug & Play)**

* **Détails :** Module optionnel désactivable pour la génération de contenu.
* **Sous-tâches :**

1. Interface `GTMAssistant` : Abstraction pour les appels LLM.
2. **Feature Toggle :** Vérification du flag `ai_enabled` dans les réglages du projet avant d'exécuter les fonctions IA.
3. Fonction "Generate Copy" : Si activé, suggère les variantes SMS/Social Media à partir des objectifs de l'Initiative.

### **Tâche 4.2 : Webhooks & Notifications**

* **Détails :** Sortir les informations du SaaS vers d'autres outils.
* **Sous-tâches :**

1. Notification Engine : Envoi d'alertes (Email/Slack) lorsqu'une deadline approche (tâche non finie à `end_date - 24h`).
2. Webhook Outbound : Envoyer un payload JSON lorsqu'une phase est marquée comme terminée.

---

## Phase 5 : Déploiement & Assets (JOURS 15-17)

### **Tâche 5.1 : Media & File Management**

* **Détails :** Stockage des assets créatifs (Visuels Panneaux, Vidéos TikTok).
* **Sous-tâches :**

1. Intégration S3/Minio : Upload des fichiers liés aux tâches de "Création".
2. Génération d'URLs présignées pour la prévisualisation sécurisée.

### **Tâche 5.2 : Production & Monitoring**

* **Détails :** Mise à l'échelle et santé du système.
* **Outils :** Docker, Prometheus, Grafana.
* **Sous-tâches :**

1. Dockerisation de l'App Koa et des Workers.
2. Instrumentation : Métriques sur le temps de recalcul du Gantt et usage Redis.
3. CI/CD : Pipeline de tests unitaires (Jest) et déploiement automatisé.

---

### Récapitulatif de la Stack par usage :

* **Postgres (Objection) :** Structure GTM, Budgets, Utilisateurs, Dépendances.
* **Redis :** Sessions, Verrous d'édition (Locking), Cache de calcul de timeline, Pub/Sub WebSockets.
* **S3/Minio :** Assets créatifs (Images, Vidéos de campagne).
* **IA Service (Adapter) :** Optionnel (Désactivable via config).

**Souhaites-tu que je détaille le service d'Auto-Scheduling (Logique de décalage des dates) pour ta Phase 2 ?**