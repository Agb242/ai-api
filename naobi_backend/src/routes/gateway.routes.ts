import Router from '@koa/router';
import { gatewayController } from '../controllers/gateway.controller';
import { apiKeyAuth } from '../middleware/api-key.middleware';
import { apiRateLimit } from '../middleware/rate-limit.middleware';

/** OpenAI-compatible public gateway — authenticated with API keys (Phase A allowlist) */
const router = new Router({ prefix: '/v1' });

const stack = [apiRateLimit, apiKeyAuth, gatewayController.proxy] as const;

// Chat & completions
router.post('/chat/completions', ...stack);
router.post('/completions', ...stack);

// Embeddings / images / audio
router.post('/embeddings', ...stack);
router.post('/images/generations', ...stack);
router.post('/images/edits', ...stack);
router.post('/audio/speech', ...stack);
router.post('/audio/transcriptions', ...stack);

// Moderations / rerank
router.post('/moderations', ...stack);
router.post('/rerank', ...stack);

// Responses API
router.post('/responses', ...stack);
router.post('/responses/compact', ...stack);
router.get('/responses/:id', ...stack);
router.delete('/responses/:id', ...stack);
router.get('/responses/:id/input_items', ...stack);
router.post('/responses/:id/cancel', ...stack);

// Files
router.post('/files', ...stack);
router.get('/files', ...stack);
router.get('/files/:id', ...stack);
router.delete('/files/:id', ...stack);
router.get('/files/:id/content', ...stack);

// Batches
router.post('/batches', ...stack);
router.get('/batches', ...stack);
router.get('/batches/:id', ...stack);
router.post('/batches/:id/cancel', ...stack);

// Curated pass-through
router.post('/messages', ...stack);
router.post('/messages/count_tokens', ...stack);

router.get('/models', apiRateLimit, apiKeyAuth, gatewayController.listModels);

export default router;
