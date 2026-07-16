// server.js — Backend POC : vente de clés API LLM via Mobile Money + LiteLLM
// Architecture :  [Frontend]  <->  [Ce backend]  <->  [LiteLLM] + [API Collectes SebPay]
//
// Variables d'environnement requises (voir .env.example) :
//   PAYMENT_MODE=simulate|live
//   COLLECTES_PUBLIC_KEY, COLLECTES_SECRET_KEY      (mode live)
//   LITELLM_URL, LITELLM_MASTER_KEY                  (génération + suivi des clés)
//   PORT

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Configuration des packs (fichier statique) ----------
const PACKS = JSON.parse(fs.readFileSync(path.join(__dirname, 'packs.json'), 'utf8'));
const PACKS_BY_ID = Object.fromEntries(PACKS.map((p) => [p.id, p]));

// ---------- Configurations API ----------
const COLLECTES_API_URL = process.env.COLLECTES_API_URL || 'https://newapi.sebpay.bj/api/v1';
const COLLECTES_PUBLIC_KEY = process.env.COLLECTES_PUBLIC_KEY;
const COLLECTES_SECRET_KEY = process.env.COLLECTES_SECRET_KEY;
const LITELLM_URL = (process.env.LITELLM_URL || 'http://localhost:4000').replace(/\/$/, '');
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY;

// simulate | live  (absence ou "live" => live ; toute autre valeur => simulate)
const PAYMENT_MODE = (process.env.PAYMENT_MODE || 'simulate').toLowerCase() === 'live' ? 'live' : 'simulate';

// Délai d'auto-approbation en mode simulate (ms)
const SIMULATE_APPROVE_MS = parseInt(process.env.SIMULATE_APPROVE_MS || '5000', 10);

// Stockage en mémoire des transactions et clés (POC — remplacer par SQLite/PostgreSQL en prod)
// external_ref -> { status, packId, phone, key, createdAt }
const transactions = {};

// ---------- Middlewares ----------
app.use(express.json());

// CORS permissif pour le POC
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Servir le frontend statique
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Helpers ----------

function genRef(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Slugifie un pseudo pour en faire un user_id valide : "Jean Dupont!" -> "jean-dupont"
function slugifyPseudo(pseudo) {
  return pseudo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'user';
}

// Provisionne un utilisateur interne LiteLLM + une clé liée à cet utilisateur.
// Renvoie { key, user_id, user_alias, expires }.
async function provisionLiteLLMUser(pack, pseudo, phone, externalRef) {
  if (!LITELLM_MASTER_KEY) {
    throw new Error('LITELLM_MASTER_KEY manquant côté serveur');
  }

  const slug = slugifyPseudo(pseudo);
  const userId = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const userEmail = `${slug}@local.poc`; // champ souvent requis par LiteLLM (POC)

  // 1) Création de l'utilisateur interne
  try {
    const userResp = await fetch(`${LITELLM_URL}/user/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LITELLM_MASTER_KEY}`,
      },
      body: JSON.stringify({
        user_id: userId,
        user_alias: pseudo,
        user_email: userEmail,
        models: pack.models,
        max_budget: pack.max_budget,
        metadata: { pack_id: pack.id, phone, external_ref: externalRef },
      }),
    });
    // 409 = utilisateur existant : on continue avec le même user_id
    if (!userResp.ok && userResp.status !== 409) {
      const errText = await userResp.text();
      throw new Error(`LiteLLM /user/new ${userResp.status}: ${errText}`);
    }
  } catch (err) {
    throw new Error(`Échec création utilisateur LiteLLM: ${err.message}`);
  }

  // 2) Génération d'une clé liée à cet utilisateur
  const keyPayload = {
    user_id: userId,
    key_alias: `pack-${pack.id}-${externalRef}`, // doit être unique côté LiteLLM
    models: pack.models,
    max_budget: pack.max_budget,
    duration: pack.duration,
    rpm_limit: pack.rpm_limit,
    tpm_limit: pack.tpm_limit,
    metadata: { phone, pack_id: pack.id, external_ref: externalRef },
  };

  const response = await fetch(`${LITELLM_URL}/key/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LITELLM_MASTER_KEY}`,
    },
    body: JSON.stringify(keyPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LiteLLM /key/generate ${response.status}: ${errorText}`);
  }
  const data = await response.json();
  return {
    key: data.key,
    user_id: userId,
    user_alias: pseudo,
    expires: data.expires,
  };
}

// Construit le payload de réponse "status" enrichi avec les infos du pack
// (le proxy New API ne persiste pas max_budget/duration/models au niveau clé).
function packInfoForTx(tx) {
  const pack = PACKS_BY_ID[tx.packId];
  if (!pack) return { models: [] };
  return {
    pack_name: pack.name,
    models: pack.models,
    model_labels: pack.model_labels || {},
    max_budget: pack.max_budget,
    duration: pack.duration,
    created_at: tx.createdAt || Date.now(),
  };
}

// Retrouve la transaction liée à une clé (pour le login dashboard).
function findTxByKey(key) {
  for (const tx of Object.values(transactions)) {
    if (tx.key === key) return tx;
  }
  return null;
}

// ---------- Routes ----------

// 0. Health + mode (utile pour debug frontend)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    payment_mode: PAYMENT_MODE,
    litellm_url: LITELLM_URL,
    litellm_configured: Boolean(LITELLM_MASTER_KEY),
    collectes_configured: Boolean(COLLECTES_PUBLIC_KEY && COLLECTES_SECRET_KEY),
  });
});

// 1. Liste des packs
app.get('/api/packs', (req, res) => {
  res.json(PACKS);
});

// 2. Initier une collecte (Mobile Money)
app.post('/api/collections/initiate', async (req, res) => {
  const { packId, phone, pseudo, operator = 'mtn', country = 'BJ' } = req.body || {};
  const pack = PACKS_BY_ID[packId];

  if (!pack) return res.status(400).json({ success: false, message: 'Pack invalide' });
  if (!phone) return res.status(400).json({ success: false, message: 'Numéro de téléphone requis' });
  if (!pseudo || !pseudo.trim()) return res.status(400).json({ success: false, message: 'Pseudo requis' });

  const externalRef = genRef(`PACK-${packId}`);

  // ---- Mode SIMULATION : on évite tout appel externe ----
  if (PAYMENT_MODE === 'simulate') {
    transactions[externalRef] = {
      status: 'pending',
      packId,
      phone,
      pseudo,
      key: null,
      user_id: null,
      user_alias: null,
      createdAt: Date.now(),
      simulated: true,
    };

    // Auto-approbation différée : on provisionne l'utilisateur + la clé au passage "approved"
    setTimeout(async () => {
      const tx = transactions[externalRef];
      if (tx && tx.status === 'pending') {
        tx.status = 'approved';
        try {
          if (LITELLM_MASTER_KEY) {
            const prov = await provisionLiteLLMUser(pack, tx.pseudo, tx.phone, externalRef);
            tx.key = prov.key;
            tx.user_id = prov.user_id;
            tx.user_alias = prov.user_alias;
            console.log(`✅ [SIM] Utilisateur + clé créés pour ${externalRef} (${prov.user_id})`);
          } else {
            // Pas de LiteLLM configuré : on renvoie des identifiants factices pour tester le flux UI
            tx.key = `sk-sim-${Math.random().toString(36).slice(2, 14)}`;
            tx.user_id = `${slugifyPseudo(tx.pseudo)}-${Math.random().toString(36).slice(2, 6)}`;
            tx.user_alias = tx.pseudo;
            console.log(`✅ [SIM] Identifiants factices générés pour ${externalRef} (LiteLLM non configuré)`);
          }
        } catch (err) {
          tx.status = 'rejected';
          tx.error = err.message;
          console.error(`❌ [SIM] Provisioning échoué pour ${externalRef}:`, err.message);
        }
      }
    }, SIMULATE_APPROVE_MS);

    return res.json({
      success: true,
      mode: 'simulate',
      transaction_id: `sim-${Date.now()}`,
      external_reference: externalRef,
      status: 'pending',
      provider_link: null,
    });
  }

  // ---- Mode LIVE : appel réel à l'API Collectes ----
  if (!COLLECTES_PUBLIC_KEY || !COLLECTES_SECRET_KEY) {
    return res.status(500).json({
      success: false,
      message: 'Mode live mais clés Collectes manquantes (COLLECTES_PUBLIC_KEY / COLLECTES_SECRET_KEY).',
    });
  }

  try {
    const payload = {
      amount: pack.price,
      currency: pack.currency,
      phone,
      operator,
      country,
      external_reference: externalRef,
      callback_url: `${req.protocol}://${req.get('host')}/api/webhook/collectes`,
    };

    const response = await fetch(`${COLLECTES_API_URL}/collections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Public-Key': COLLECTES_PUBLIC_KEY,
        'X-Secret-Key': COLLECTES_SECRET_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `Erreur API Collectes (${response.status})`);
    }

    transactions[externalRef] = {
      status: data.data?.status || 'pending',
      packId,
      phone,
      pseudo,
      key: null,
      user_id: null,
      user_alias: null,
      createdAt: Date.now(),
    };

    return res.json({
      success: true,
      mode: 'live',
      transaction_id: data.data?.transaction_id,
      external_reference: externalRef,
      status: data.data?.status || 'pending',
      provider_link: data.data?.provider_link || null,
    });
  } catch (err) {
    console.error('Erreur initiation collecte:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Statut d'une transaction (polling)
app.get('/api/collections/status/:ref', async (req, res) => {
  const ref = req.params.ref;
  const localTx = transactions[ref];

  if (!localTx) {
    return res.status(404).json({ success: false, message: 'Transaction inconnue' });
  }

  // Déjà approuvée avec clé : on renvoie directement (cache)
  if (localTx.status === 'approved' && localTx.key) {
    const pack = PACKS_BY_ID[localTx.packId];
    return res.json({
      status: 'approved',
      key: localTx.key,
      user_id: localTx.user_id,
      user_alias: localTx.user_alias,
      ...packInfoForTx(localTx),
    });
  }

  // En mode simulate, on ne questionne pas d'API externe : l'auto-approbation met à jour localTx.
  if (localTx.simulated) {
    return res.json({
      status: localTx.status,
      key: localTx.key || null,
      user_id: localTx.user_id || null,
      user_alias: localTx.user_alias || null,
      ...packInfoForTx(localTx),
    });
  }

  // Mode live : interroger l'API Collectes
  try {
    const response = await fetch(`${COLLECTES_API_URL}/collections/${ref}`, {
      headers: {
        'X-Public-Key': COLLECTES_PUBLIC_KEY,
        'X-Secret-Key': COLLECTES_SECRET_KEY,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Erreur récupération statut');
    }

    const newStatus = data.data?.status || 'pending';
    localTx.status = newStatus;

    if (newStatus === 'approved' && !localTx.key) {
      const pack = PACKS_BY_ID[localTx.packId];
      const prov = await provisionLiteLLMUser(pack, localTx.pseudo, localTx.phone, ref);
      localTx.key = prov.key;
      localTx.user_id = prov.user_id;
      localTx.user_alias = prov.user_alias;
    }

    return res.json({
      status: localTx.status,
      key: localTx.key || null,
      user_id: localTx.user_id || null,
      user_alias: localTx.user_alias || null,
      ...packInfoForTx(localTx),
    });
  } catch (err) {
    console.error('Erreur statut collecte:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Webhook Collectes (optionnel — pourrait remplacer le polling)
app.post('/api/webhook/collectes', (req, res) => {
  console.log('Webhook Collectes reçu:', req.body);
  res.sendStatus(200);
});

// ---------- Routes de suivi (observabilité LiteLLM) ----------
// Le frontend n'appelle JAMAIS LiteLLM directement : le backend proxifie avec la MASTER_KEY.

// 4. Infos d'une clé (solde, budget, modèles, expiration)
app.get('/api/key-info/:key', async (req, res) => {
  const userKey = req.params.key;
  try {
    const response = await fetch(`${LITELLM_URL}/key/info?key=${encodeURIComponent(userKey)}`, {
      headers: { Authorization: `Bearer ${LITELLM_MASTER_KEY}` },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LiteLLM /key/info ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    res.json({
      spend: data.spend || 0,
      max_budget: data.max_budget || 0,
      models: data.models || [],
      expires: data.expires,
      key_alias: data.key_alias || `${userKey.slice(0, 8)}...`,
    });
  } catch (err) {
    console.error('Erreur key-info:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Historique des requêtes d'une clé (logs de dépense)
app.get('/api/key-usage/:key', async (req, res) => {
  const userKey = req.params.key;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  try {
    // On privilégie le GET ; en cas d'échec, on retombe sur le POST (selon la version LiteLLM)
    let response = await fetch(
      `${LITELLM_URL}/global/spend/logs?api_key=${encodeURIComponent(userKey)}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${LITELLM_MASTER_KEY}` } }
    );

    if (!response.ok) {
      response = await fetch(`${LITELLM_URL}/global/spend/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LITELLM_MASTER_KEY}`,
        },
        body: JSON.stringify({ api_key: userKey, limit }),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LiteLLM /global/spend/logs ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    res.json(data); // tableau de logs
  } catch (err) {
    console.error('Erreur key-usage:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Coût agrégé par jour sur N jours (pour graphique dashboard)
//    Renvoie { points: [{date:'YYYY-MM-DD', spend}], source: 'report'|'logs'|'empty' }
//    En cas d'erreur (LiteLLM down), on répond 200 avec source:'empty' pour ne pas casser le dashboard.
app.get('/api/key-spend-daily/:key', async (req, res) => {
  const userKey = req.params.key;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 90);

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (days - 1));
  const fmt = (d) => d.toISOString().slice(0, 10);
  const startStr = fmt(startDate);
  const endStr = fmt(today);

  // Grille complète des jours attendus (pour que le graphe ait une échelle régulière)
  const dayMap = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dayMap.set(fmt(d), 0);
  }

  const empty = { points: Array.from(dayMap, ([date, spend]) => ({ date, spend })), source: 'empty' };

  try {
    // Tentative 1 : POST /global/spend/report avec group_by day (selon version LiteLLM)
    let reportOk = false;
    let reportData = null;
    try {
      const response = await fetch(`${LITELLM_URL}/global/spend/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LITELLM_MASTER_KEY}`,
        },
        body: JSON.stringify({
          api_key: userKey,
          start_date: startStr,
          end_date: endStr,
          group_by: 'day',
        }),
      });
      if (response.ok) {
        reportData = await response.json();
        reportOk = true;
      }
    } catch {
      reportOk = false; // le report n'est pas dispo, on tombe sur les logs
    }

    if (reportOk && Array.isArray(reportData)) {
      reportData.forEach((row) => {
        // Selon la version : row.day, row.date, ou row.startTime
        const dayKey = (row.day || row.date || row.startTime || '').slice(0, 10);
        if (dayMap.has(dayKey)) {
          dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + (row.spend || row.total_spend || 0));
        }
      });
      return res.json({ points: Array.from(dayMap, ([date, spend]) => ({ date, spend })), source: 'report' });
    }

    // Tentative 2 (fallback) : /global/spend/logs agrégé par jour côté backend
    let response = await fetch(
      `${LITELLM_URL}/global/spend/logs?api_key=${encodeURIComponent(userKey)}&limit=100`,
      { headers: { Authorization: `Bearer ${LITELLM_MASTER_KEY}` } }
    );
    if (!response.ok) {
      response = await fetch(`${LITELLM_URL}/global/spend/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LITELLM_MASTER_KEY}`,
        },
        body: JSON.stringify({ api_key: userKey, limit: 100 }),
      });
    }
    if (!response.ok) {
      // Pas de logs dispo -> grille vide
      return res.json(empty);
    }
    const logs = await response.json();
    (Array.isArray(logs) ? logs : (logs.data || [])).forEach((log) => {
      const ts = log.startTime || log.timestamp || log.call_type;
      if (!ts) return;
      const dayKey = String(ts).slice(0, 10);
      if (dayMap.has(dayKey)) {
        dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + (log.spend || 0));
      }
    });
    const source = Array.from(dayMap.values()).some((v) => v > 0) ? 'logs' : 'empty';
    return res.json({ points: Array.from(dayMap, ([date, spend]) => ({ date, spend })), source });
  } catch (err) {
    console.error('Erreur key-spend-daily:', err.message);
    return res.json(empty); // 200 + grille vide : le dashboard reste utilisable
  }
});

// ---------- Chatground (proxy /v1/chat/completions) ----------
// Le frontend n'appelle jamais LiteLLM directement : le backend proxifie avec la clé utilisateur.
// Le spend est ainsi attribué à la clé de l'utilisateur (pas à la master key).
app.post('/api/chat', async (req, res) => {
  const { key, model, messages } = req.body || {};

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ ok: false, error: 'Clé (key) requise' });
  }
  if (!model || typeof model !== 'string') {
    return res.status(400).json({ ok: false, error: 'Modèle (model) requis' });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: 'messages (tableau non vide) requis' });
  }

  try {
    const response = await fetch(`${LITELLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`, // clé utilisateur → spend attribué à l'utilisateur
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errMsg = data?.error?.message || data?.message || `Erreur LiteLLM (${response.status})`;
      return res.status(response.status).json({ ok: false, error: errMsg });
    }

    return res.json({
      ok: true,
      content: data?.choices?.[0]?.message?.content || '',
      model: data?.model || model,
      usage: data?.usage || null,
    });
  } catch (err) {
    console.error('Erreur /api/chat:', err.message);
    return res.status(502).json({ ok: false, error: `Proxy chat injoignable: ${err.message}` });
  }
});

// ---------- Login dashboard (vérification de la clé via LiteLLM) ----------
// Le client se connecte avec sa clé. Le backend vérifie via /key/info que la clé est valide
// côté LiteLLM, puis renvoie les infos (enrichies du pack) pour ouvrir le dashboard.
app.post('/api/auth/verify', async (req, res) => {
  const { key } = req.body || {};
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ ok: false, error: 'Clé requise' });
  }

  // 1) La clé doit exister dans notre registre (créée via un achat)
  const tx = findTxByKey(key);
  if (!tx || tx.status !== 'approved' || !tx.key) {
    return res.status(404).json({ ok: false, error: 'Clé inconnue. Achetez un pack pour obtenir une clé.' });
  }

  // 2) Vérification de validité auprès de LiteLLM (défense en profondeur)
  if (LITELLM_MASTER_KEY) {
    try {
      const resp = await fetch(`${LITELLM_URL}/key/info?key=${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${LITELLM_MASTER_KEY}` },
      });
      if (!resp.ok) {
        return res.status(401).json({ ok: false, error: 'Clé invalide ou révoquée côté LiteLLM.' });
      }
    } catch (err) {
      // LiteLLM injoignable : on tolère (le dashboard reste accessible en POC)
      console.warn('auth/verify: LiteLLM injoignable, on tolère:', err.message);
    }
  }

  // 3) Renvoie les identifiants + infos pack
  return res.json({
    ok: true,
    key: tx.key,
    user_id: tx.user_id,
    user_alias: tx.user_alias,
    pseudo: tx.pseudo,
    ...packInfoForTx(tx),
  });
});

// ---------- Démarrage ----------
app.listen(PORT, () => {
  console.log(`Backend POC démarré sur http://localhost:${PORT}`);
  console.log(`  Mode de paiement : ${PAYMENT_MODE}`);
  console.log(`  LiteLLM          : ${LITELLM_URL} (${LITELLM_MASTER_KEY ? 'configuré' : 'NON configuré'})`);
  console.log(`  Collectes        : ${COLLECTES_API_URL} (${COLLECTES_PUBLIC_KEY && COLLECTES_SECRET_KEY ? 'configuré' : 'NON configuré'})`);
});
