import Router from '@koa/router';
import { billingController } from '../controllers/billing.controller';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { optionalOrg, requireOrg } from '../middleware/org.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';

const router = new Router({ prefix: '/billing' });

const momoInitiateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxAttempts: 10,
  keyPrefix: 'momo_initiate',
  message: 'Trop de tentatives de paiement. Réessayez dans une minute.',
});

router.get('/packs', billingController.listPacks);
router.post(
  '/collections/initiate',
  optionalAuth,
  optionalOrg,
  momoInitiateLimit,
  billingController.initiate,
);
router.get('/collections/:ref/status', billingController.status);
router.post('/webhook/collectes', billingController.webhook);

router.post('/claim', authenticate, requireOrg('developer'), billingController.claim);
router.get('/history', authenticate, requireOrg('viewer'), billingController.history);
router.post('/litellm/usage', authenticate, requireOrg('viewer'), billingController.litellmUsage);
router.get('/litellm/health', authenticate, requireOrg('viewer'), billingController.litellmHealth);
router.get('/litellm/models', authenticate, requireOrg('viewer'), billingController.liveModels);

export default router;
