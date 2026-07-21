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
router.post('/embeddings', authenticate, requireOrg('developer'), playgroundController.embeddings);
router.post(
  '/images/generations',
  authenticate,
  requireOrg('developer'),
  playgroundController.imageGenerations,
);
router.post('/audio/speech', authenticate, requireOrg('developer'), playgroundController.audioSpeech);
router.post(
  '/audio/transcriptions',
  authenticate,
  requireOrg('developer'),
  playgroundController.audioTranscriptions,
);

export default router;
