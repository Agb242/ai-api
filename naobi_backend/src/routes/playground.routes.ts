import Router from '@koa/router';
import { authenticate } from '../middleware/auth.middleware';
import { requireOrg } from '../middleware/org.middleware';
import { playgroundController } from '../controllers/playground.controller';

const router = new Router({ prefix: '/playground' });

router.get('/context', authenticate, requireOrg('viewer'), playgroundController.context);
router.get(
  '/capabilities',
  authenticate,
  requireOrg('viewer'),
  playgroundController.capabilities,
);
router.post(
  '/token-count',
  authenticate,
  requireOrg('viewer'),
  playgroundController.tokenCount,
);
router.post(
  '/transform-request',
  authenticate,
  requireOrg('developer'),
  playgroundController.transformRequest,
);
router.post(
  '/fallback-test',
  authenticate,
  requireOrg('developer'),
  playgroundController.fallbackTest,
);
router.post(
  '/chat/completions',
  authenticate,
  requireOrg('developer'),
  playgroundController.chatCompletions,
);
router.post(
  '/embeddings',
  authenticate,
  requireOrg('developer'),
  async (ctx, next) => {
    ctx.params.modality = 'embeddings';
    return playgroundController.modality(ctx);
  },
);
router.post(
  '/images/generations',
  authenticate,
  requireOrg('developer'),
  async (ctx) => {
    ctx.params.modality = 'images';
    return playgroundController.modality(ctx);
  },
);
router.post(
  '/audio/speech',
  authenticate,
  requireOrg('developer'),
  async (ctx) => {
    ctx.params.modality = 'audio-speech';
    return playgroundController.modality(ctx);
  },
);

export default router;
