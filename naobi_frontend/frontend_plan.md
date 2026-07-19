Tu peux le reformuler de manière plus structurée et orientée produit/UI pour que ton IDE ou ton agent IA comprenne clairement l’intention :

Le workspace doit être organisé selon une architecture **Origami-like**, avec une expérience centrée sur l’édition de documents assistée par IA.

**Layout principal**

L’interface est composée de deux sections principales :

1. **Section Chat IA (gauche)**

* Affichée par défaut sur le côté gauche.
* Utilisée pour les conversations avec l’assistant IA.
* Permet :

  * poser des questions
  * demander la création ou modification d’un contrat
  * demander une analyse
  * générer des clauses
  * ajouter des signatures
  * lancer des actions automatiques

Le chat doit être **rétractable**.

Comportement :

* Lorsque l’utilisateur clique sur **Agrandir l’éditeur**, le chat se réduit ou disparaît complètement.
* L’utilisateur peut réouvrir le chat à tout moment via un bouton flottant.
* Le système doit mémoriser le dernier état :

  * ouvert
  * réduit
  * fermé

---

2. **Section Widget principal (droite)**

Cette section est la zone dynamique principale de travail.

Le widget principal est un **éditeur de documents style Google Docs**, avec les fonctionnalités suivantes :

Fonctionnalités :

* édition riche
* collaboration temps réel
* commentaires
* suivi des changements
* historique des versions
* placement de zones de signature
* insertion de variables dynamiques

Exemples :

```text
{{client_name}}
{{contract_date}}
{{company_name}}
{{signature_client}}
```

L’éditeur doit pouvoir passer dans plusieurs états :

```text
Normal :
┌────Chat────┬────────Editor────────┐

Expanded :
┌────────────────Editor────────────┐

Fullscreen :
┌──────────────────────────────────┐
│             Editor              │
└──────────────────────────────────┘
```

---

**IA intégrée dans l’éditeur**

Même lorsque le chat est fermé, l’IA reste active dans l’éditeur.

L’IA peut intervenir de plusieurs façons :

**Mode suggestions contextuelles**

Exemple :

```text
Suggestion IA :

Une clause de confidentialité semble manquante.
[Ajouter]
[Ignorer]
```

Lorsque l’utilisateur clique sur **Ajouter** :

* l’IA modifie directement le document
* ajoute la nouvelle section
* met à jour le contenu automatiquement

---

**Mode popup contextuel**

Exemple :

```text
IA :

Le contrat expire dans 30 jours.
Voulez-vous :

[Renouveler]
[Créer un avenant]
[Reporter]
```

Le popup apparaît directement dans l’éditeur.

---

**Mode agent autonome**

Lorsque l’utilisateur sélectionne du texte :

Exemple :

```text
Sélection :

"Le prestataire sera payé..."

Actions IA :

[Améliorer]
[Résumer]
[Réécrire]
[Ajouter une clause]
[Traduire]
```

L’IA agit directement sur le document sans ouvrir le chat.

---

**Bouton "Explorer" ou "Sortie"**

Ajouter un bouton global permettant de quitter l’éditeur et accéder à deux onglets :

### Onglet 1 : Galerie Documents

Affichage style Google Docs :

* vraies miniatures visuelles
* aperçu réel de la première page
* nom du document
* date de modification
* statut
* auteur
* nombre de commentaires

Exemple :

```text
┌─────────┐
│Preview │
│PDF/DOC │
└─────────┘

Contrat ABC Corp
Modifié il y a 2 heures
Brouillon
```

---

### Onglet 2 : Contrats en cours

Vue tableau dynamique :

Colonnes :

* Nom contrat
* Statut
* Parties prenantes
* Date création
* Date expiration
* Étape actuelle
* Actions rapides

Exemple :

```text
| Contrat | Statut | Parties | Échéance | Actions |
|----------|---------|---------|-----------|----------|
| ABC Corp | Signé | ABC/KnotFlow | 24/06 | Voir |
| SNPC | En attente | SNPC/KnotFlow | 12/07 | Modifier |
```

Actions rapides :

* ouvrir
* envoyer pour signature
* télécharger PDF
* dupliquer
* archiver
* supprimer

Objectif UX global :

Créer une expérience hybride entre :

* Google Docs
* Notion
* Origami
* Ironclad
* ChatGPT Agent Mode

où l’IA devient une couche vivante qui agit directement dans le document au lieu d’être séparée de l’éditeur.
