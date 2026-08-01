import Router from '@koa/router';
import { gatewayController } from '../controllers/gateway.controller';
import { apiKeyAuth } from '../middleware/api-key.middleware';
import { apiRateLimit } from '../middleware/rate-limit.middleware';

/** OpenAI-compatible public gateway — authenticated with API keys (Phase A allowlist). */
const router = new Router({ prefix: '/v1' });

const mw = [apiRateLimit, apiKeyAuth] as const;

router.get('/models', ...mw, gatewayController.listModels);

// Chat & legacy completions
router.post('/chat/completions', ...mw, gatewayController.chatCompletions);
router.post('/completions', ...mw, gatewayController.proxy);

// Embeddings
router.post('/embeddings', ...mw, gatewayController.proxy);

// Images
router.post('/images/generations', ...mw, gatewayController.proxy);
router.post('/images/edits', ...mw, gatewayController.proxy);

// Audio
router.post('/audio/speech', ...mw, gatewayController.proxy);
router.post('/audio/transcriptions', ...mw, gatewayController.proxy);
router.post('/audio/translations', ...mw, gatewayController.proxy);

// Moderations & rerank
router.post('/moderations', ...mw, gatewayController.proxy);
router.post('/rerank', ...mw, gatewayController.proxy);

// Responses API
router.post('/responses', ...mw, gatewayController.proxy);
router.get('/responses/:id', ...mw, gatewayController.proxy);
router.delete('/responses/:id', ...mw, gatewayController.proxy);
router.post('/responses/:id/cancel', ...mw, gatewayController.proxy);
router.post('/responses/compact', ...mw, gatewayController.proxy);

// Files & batches
router.get('/files', ...mw, gatewayController.proxy);
router.post('/files', ...mw, gatewayController.proxy);
router.get('/files/:id', ...mw, gatewayController.proxy);
router.delete('/files/:id', ...mw, gatewayController.proxy);
router.get('/files/:id/content', ...mw, gatewayController.proxy);
router.get('/batches', ...mw, gatewayController.proxy);
router.post('/batches', ...mw, gatewayController.proxy);
router.get('/batches/:id', ...mw, gatewayController.proxy);
router.post('/batches/:id/cancel', ...mw, gatewayController.proxy);

// Anthropic curated
router.post('/messages', ...mw, gatewayController.proxy);
router.post('/messages/count_tokens', ...mw, gatewayController.proxy);

// Google curated (generateContent style)
router.post('/models/:modelAndAction', ...mw, async (ctx, next) => {
  // Koa captures "gemini-pro:generateContent" as one param — rewrite path for classifier
  const raw = ctx.params.modelAndAction || '';
  if (!raw.includes(':')) {
    ctx.status = 404;
    ctx.body = { error: { message: 'Not found', code: 'NOT_FOUND' } };
    return;
  }
  ctx.state.gatewayPath = `/v1/models/${raw}`;
  return gatewayController.proxy(ctx);
});

export default router;
