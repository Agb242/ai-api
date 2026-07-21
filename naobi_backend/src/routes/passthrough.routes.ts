import Router from '@koa/router';
import { gatewayController } from '../controllers/gateway.controller';
import { apiKeyAuth } from '../middleware/api-key.middleware';
import { apiRateLimit } from '../middleware/rate-limit.middleware';

/**
 * Curated provider pass-through (Phase A) — Anthropic + Google GenAI paths.
 */
const router = new Router();
const stack = [apiRateLimit, apiKeyAuth, gatewayController.proxy] as const;

router.post(/^\/anthropic(?:\/.*)?$/, ...stack);
router.all(/^\/gemini(?:\/.*)?$/, ...stack);
router.post(/^\/v1beta\/models\/.+$/, ...stack);

export default router;
