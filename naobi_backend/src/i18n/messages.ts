export type Locale = 'fr' | 'en';

const messages: Record<Locale, Record<string, string>> = {
  fr: {
    INVALID_EMAIL: 'Email invalide',
    MISSING_FIELDS: 'Champs requis manquants',
    UNAUTHORIZED: 'Non authentifié',
    FORBIDDEN: 'Accès refusé',
    NOT_FOUND: 'Ressource introuvable',
    INSUFFICIENT_BALANCE:
      'Solde insuffisant. Rechargez votre wallet pour continuer à envoyer des requêtes.',
    REQUEST_BLOCKED: 'Requête bloquée — motif : {rule}.',
    KEY_BUDGET_EXCEEDED:
      'Plafond de la clé atteint pour cette période. Augmentez le plafond ou attendez la prochaine période.',
    KEY_EXPIRED: 'Cette clé a expiré le {date}. Créez une nouvelle clé pour continuer.',
    KEY_REVOKED: 'Cette clé a été révoquée.',
    MODEL_UNAVAILABLE:
      'Le modèle demandé est indisponible actuellement. Aucun modèle de secours n’est configuré pour cette organisation.',
    MODEL_NOT_FOUND: 'Modèle inconnu ou non disponible.',
    ROUTER_DEGRADED: 'Le routeur principal est indisponible. Bascule vers le routage direct.',
    PROVIDER_ERROR: 'Erreur du fournisseur de modèle.',
    INVALID_API_KEY: 'Clé API invalide.',
    ORG_REQUIRED: 'Organisation requise.',
    LAST_OWNER: 'Impossible de retirer le dernier Owner.',
    INVITE_EXPIRED: 'Cette invitation a expiré.',
    TOPUP_PENDING: 'Recharge en attente de confirmation.',
    TOPUP_COMPLETED: 'Wallet crédité.',
    KEY_CREATED: 'Clé créée. Copiez-la maintenant — elle ne sera plus affichée.',
    KEY_REVOKED_OK: 'Clé révoquée',
    KEY_DISABLED_OK: 'Clé désactivée',
    KEY_ENABLED_OK: 'Clé réactivée',
    KEY_DISABLED: 'Cette clé est désactivée.',
    KEY_PLAINTEXT_UNAVAILABLE:
      'Cette clé ne peut pas être utilisée dans le playground. Créez une nouvelle clé (les anciennes n’ont pas de secret stocké chiffré).',
    KEY_ROTATED: 'Clé régénérée. Copiez-la maintenant — elle ne sera plus affichée.',
    KEY_SPEND_RESET: 'Compteur de dépense de la clé réinitialisé.',
    ORG_BUDGET_EXCEEDED:
      'Plafond budgétaire de l’organisation atteint pour cette période.',
    BUDGET_SAVED: 'Plafond budgétaire enregistré.',
    CONFIRM_REQUIRED: 'Confirmation requise (confirm: true).',
    FILTER_ACTIVATED: 'Règle de filtre activée',
    FILTER_DEACTIVATED: 'Règle de filtre désactivée',
    PACK_INVALID: 'Pack invalide ou indisponible.',
    COLLECTES_ERROR: 'Échec de l’initiation du paiement Mobile Money.',
    MOMO_NOT_CONFIGURED: 'Paiement Mobile Money non configuré.',
    KEY_CLAIMED: 'Clé liée à votre compte. Elle ne sera plus affichée en clair.',
    KEY_UNKNOWN: 'Clé inconnue ou paiement non confirmé.',
    KEY_ALREADY_CLAIMED: 'Cette clé est déjà liée à un compte.',
    LITELLM_NOT_CONFIGURED: 'LiteLLM Proxy non configuré sur le serveur.',
    LITELLM_UNAVAILABLE: 'LiteLLM Proxy indisponible. Réessayez plus tard.',
    TOPUP_DISABLED: 'Recharge stub désactivée. Achetez un pack Mobile Money.',
    AGENT_TEMPLATE_NOT_FOUND: 'Métier introuvable ou indisponible.',
    AGENT_NOT_FOUND: 'Agent introuvable.',
  },
  en: {
    INVALID_EMAIL: 'Invalid email',
    MISSING_FIELDS: 'Required fields missing',
    UNAUTHORIZED: 'Unauthenticated',
    FORBIDDEN: 'Access denied',
    NOT_FOUND: 'Resource not found',
    INSUFFICIENT_BALANCE:
      'Insufficient balance. Top up your wallet to continue sending requests.',
    REQUEST_BLOCKED: 'Request blocked — reason: {rule}.',
    KEY_BUDGET_EXCEEDED:
      'API key ceiling reached for this period. Raise the ceiling or wait for the next period.',
    KEY_EXPIRED: 'This key expired on {date}. Create a new key to continue.',
    KEY_REVOKED: 'This key has been revoked.',
    MODEL_UNAVAILABLE:
      'The requested model is currently unavailable. No fallback model is configured for this organization.',
    MODEL_NOT_FOUND: 'Unknown or unavailable model.',
    ROUTER_DEGRADED: 'Primary router unavailable. Falling back to direct routing.',
    PROVIDER_ERROR: 'Model provider error.',
    INVALID_API_KEY: 'Invalid API key.',
    ORG_REQUIRED: 'Organization required.',
    LAST_OWNER: 'Cannot remove the last Owner.',
    INVITE_EXPIRED: 'This invitation has expired.',
    TOPUP_PENDING: 'Top-up pending confirmation.',
    TOPUP_COMPLETED: 'Wallet credited.',
    KEY_CREATED: 'Key created. Copy it now — it will not be shown again.',
    KEY_REVOKED_OK: 'Key revoked',
    KEY_DISABLED_OK: 'Key disabled',
    KEY_ENABLED_OK: 'Key enabled',
    KEY_DISABLED: 'This key is disabled.',
    KEY_PLAINTEXT_UNAVAILABLE:
      'This key cannot be used in the playground. Create a new key (older keys have no encrypted secret stored).',
    KEY_ROTATED: 'Key rotated. Copy it now — it will not be shown again.',
    KEY_SPEND_RESET: 'Key spend counter reset.',
    ORG_BUDGET_EXCEEDED: 'Organization budget ceiling reached for this period.',
    BUDGET_SAVED: 'Budget ceiling saved.',
    CONFIRM_REQUIRED: 'Confirmation required (confirm: true).',
    FILTER_ACTIVATED: 'Filter rule activated',
    FILTER_DEACTIVATED: 'Filter rule deactivated',
    PACK_INVALID: 'Invalid or unavailable pack.',
    COLLECTES_ERROR: 'Failed to initiate Mobile Money payment.',
    MOMO_NOT_CONFIGURED: 'Mobile Money payment is not configured.',
    KEY_CLAIMED: 'Key linked to your account. It will no longer be shown in plaintext.',
    KEY_UNKNOWN: 'Unknown key or payment not confirmed.',
    KEY_ALREADY_CLAIMED: 'This key is already linked to an account.',
    LITELLM_NOT_CONFIGURED: 'LiteLLM Proxy is not configured on the server.',
    LITELLM_UNAVAILABLE: 'LiteLLM Proxy unavailable. Try again later.',
    TOPUP_DISABLED: 'Stub top-up disabled. Buy a Mobile Money pack.',
    AGENT_TEMPLATE_NOT_FOUND: 'Business template not found or unavailable.',
    AGENT_NOT_FOUND: 'Agent not found.',
  },
};

export function resolveLocale(header?: string | string[]): Locale {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return 'fr';
  const primary = raw.split(',')[0].trim().toLowerCase();
  if (primary.startsWith('en')) return 'en';
  return 'fr';
}

export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const template = messages[locale][key] || messages.en[key] || key;
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    template,
  );
}
