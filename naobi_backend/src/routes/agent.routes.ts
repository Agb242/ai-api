import Router from '@koa/router';
import { authenticate } from '../middleware/auth.middleware';
import { requireOrg } from '../middleware/org.middleware';
import { agentController } from '../controllers/agent.controller';

const router = new Router({ prefix: '/agents' });

router.get('/templates', authenticate, requireOrg('viewer'), agentController.templates);
router.get('/', authenticate, requireOrg('viewer'), agentController.list);
router.post('/', authenticate, requireOrg('developer'), agentController.create);
router.delete('/:id', authenticate, requireOrg('developer'), agentController.remove);
router.post(
  '/:id/chat/completions',
  authenticate,
  requireOrg('developer'),
  agentController.chatCompletions,
);

export default router;
