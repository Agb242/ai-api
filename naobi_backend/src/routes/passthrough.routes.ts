import Router from '@koa/router';
import { gatewayController } from '../controllers/gateway.controller';
import { apiKeyAuth } from '../middleware/api-key.middleware';
import { apiRateLimit } from '../middleware/rate-limit.middleware';

/**
 * Extra OpenAI-compatible paths without /v1 prefix (LiteLLM aliases).
 * Mounted at root alongside /v1/*.
 */
const router = new Router();

const mw = [apiRateLimit, apiKeyAuth] as const;

router.post('/embeddings', ...mw, async (ctx) => {
  ctx.state.gatewayPath = '/embeddings';
  return gatewayController.proxy(ctx);
});

router.post('/moderations', ...mw, async (ctx) => {
  ctx.state.gatewayPath = '/moderations';
  return gatewayController.proxy(ctx);
});

router.post('/rerank', ...mw, async (ctx) => {
  ctx.state.gatewayPath = '/rerank';
  return gatewayController.proxy(ctx);
});

export default router;
