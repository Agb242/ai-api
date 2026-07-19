import Router from '@koa/router';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { otpGenerationRateLimit, otpRateLimit } from '../middleware/rate-limit.middleware';

const router = new Router({
  prefix: '/auth',
});

router.post('/request-otp', otpGenerationRateLimit, authController.requestOtp);
router.post('/verify-otp', otpRateLimit, authController.verifyOtp);
router.post('/google', authController.googleAuth);
router.post('/verify-key', authController.verifyLegacyKey);
router.post('/claim-key', authenticate, authController.claimKey);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, authController.updateMe);
router.post('/refresh', authenticate, authController.refreshSession);

export default router;
