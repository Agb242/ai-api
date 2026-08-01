import Router from '@koa/router';
import authRoutes from './auth.routes';
import dashboardRoutes from './dashboard.routes';
import billingRoutes from './billing.routes';
import playgroundRoutes from './playground.routes';
import gatewayRoutes from './gateway.routes';
import passthroughRoutes from './passthrough.routes';

const router = new Router();

const api = new Router({ prefix: '/api/v1' });
api.use(authRoutes.routes());
api.use(authRoutes.allowedMethods());
api.use(dashboardRoutes.routes());
api.use(dashboardRoutes.allowedMethods());
api.use(billingRoutes.routes());
api.use(billingRoutes.allowedMethods());
api.use(playgroundRoutes.routes());
api.use(playgroundRoutes.allowedMethods());

router.use(api.routes());
router.use(api.allowedMethods());

// OpenAI-compatible paths at root: /v1/chat/completions (+ Phase A)
router.use(gatewayRoutes.routes());
router.use(gatewayRoutes.allowedMethods());
router.use(passthroughRoutes.routes());
router.use(passthroughRoutes.allowedMethods());

export default router;
