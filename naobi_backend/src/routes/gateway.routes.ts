import Router from '@koa/router';
import { gatewayController } from '../controllers/gateway.controller';
import { apiKeyAuth } from '../middleware/api-key.middleware';
import { apiRateLimit } from '../middleware/rate-limit.middleware';

/** OpenAI-compatible public gateway — authenticated with API keys */
const router = new Router({ prefix: '/v1' });

router.post('/chat/completions', apiRateLimit, apiKeyAuth, gatewayController.chatCompletions);
router.get('/models', apiRateLimit, apiKeyAuth, gatewayController.listModels);

export default router;
