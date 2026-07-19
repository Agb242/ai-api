import Router from '@koa/router';
import { authenticate } from '../middleware/auth.middleware';
import { requireOrg } from '../middleware/org.middleware';
import { playgroundController } from '../controllers/playground.controller';

const router = new Router({ prefix: '/playground' });

router.get('/context', authenticate, requireOrg('viewer'), playgroundController.context);
router.post(
  '/chat/completions',
  authenticate,
  requireOrg('developer'),
  playgroundController.chatCompletions,
);

export default router;
