# knotflowai Backend API

Backend API pour l'application de gestion de caisse knotflowai.

## Technologies

- **Node.js** + **TypeScript**
- **Koa.js** - Framework web
- **Knex.js** + **Objection.js** - ORM et migrations
- **PostgreSQL** - Base de données
- **JWT** - Authentification

## Installation

1. Cloner le projet
2. Installer les dépendances :
```bash
npm install
```

3. Configurer les variables d'environnement :
```bash
cp .env.example .env
# Modifier les valeurs dans .env
```

4. Configurer la base de données PostgreSQL
5. Lancer les migrations :
```bash
npm run migrate:latest
```

## Scripts disponibles

- `npm run dev` - Lancer en mode développement
- `npm run build` - Compiler le TypeScript
- `npm start` - Lancer en production
- `npm run migrate:make <name>` - Créer une migration
- `npm run migrate:latest` - Appliquer les migrations
- `npm run migrate:rollback` - Annuler la dernière migration
- `npm run seed:run` - Lancer les seeds
- `npm test` - Lancer les tests
- `npm run lint` - Vérifier le code

## Structure du projet

```
src/
├── config/          # Configuration (DB, serveur, middleware)
├── models/          # Modèles Objection.js
├── controllers/     # Contrôleurs
├── services/        # Services métier
├── routes/          # Routes API
├── middleware/      # Middleware personnalisés
├── validators/      # Validateurs Zod
├── types/           # Types TypeScript
├── utils/           # Utilitaires
└── app.ts           # Application principale
```

## API Endpoints

- `GET /health` - Health check
- `GET /api` - Information API

## Variables d'environnement

Voir `.env.example` pour la liste complète des variables.
