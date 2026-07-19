`CTASection` utilisait `useWaitlist()` mais était rendue **après** la fermeture de `WaitlistProvider` dans le layout marketing.

Elle est maintenant à l’intérieur du provider (avec le header, le contenu et le footer). Recharge `/fr` — l’erreur 500 devrait disparaître.