import Router from '@koa/router';
import { authenticate } from '../middleware/auth.middleware';
import { requireOrg } from '../middleware/org.middleware';
import {
  orgController,
  keysController,
  walletController,
  filtersController,
  logsController,
  metricsController,
  modelsController,
  membersController,
  budgetsController,
  attributionController,
  auditController,
  guardrailsController,
  accessGroupsController,
  complianceController,
} from '../controllers/dashboard.controller';

const router = new Router();

router.get('/organizations', authenticate, orgController.listMine);
router.post('/organizations', authenticate, orgController.create);

router.get('/keys', authenticate, requireOrg('developer'), keysController.list);
router.post('/keys', authenticate, requireOrg('developer'), keysController.create);
router.get('/keys/:id', authenticate, requireOrg('developer'), keysController.get);
router.patch('/keys/:id', authenticate, requireOrg('developer'), keysController.update);
router.post('/keys/:id/disable', authenticate, requireOrg('admin'), keysController.disable);
router.post('/keys/:id/enable', authenticate, requireOrg('admin'), keysController.enable);
router.post('/keys/:id/revoke', authenticate, requireOrg('admin'), keysController.revoke);
router.post('/keys/:id/rotate', authenticate, requireOrg('admin'), keysController.rotate);
router.post('/keys/:id/block', authenticate, requireOrg('admin'), keysController.disable);
router.post('/keys/:id/unblock', authenticate, requireOrg('admin'), keysController.enable);
router.post('/keys/:id/reset-spend', authenticate, requireOrg('admin'), keysController.resetSpend);
router.get('/keys/:id/metrics', authenticate, requireOrg('developer'), keysController.metrics);
router.get('/keys/:id/analytics', authenticate, requireOrg('developer'), keysController.analytics);
router.get('/keys/:id/usage', authenticate, requireOrg('developer'), keysController.usage);
router.get('/keys/:id/models', authenticate, requireOrg('developer'), keysController.models);
router.get('/keys/:id/providers', authenticate, requireOrg('developer'), keysController.providers);
router.get('/keys/:id/logs', authenticate, requireOrg('developer'), keysController.logs);
router.get('/keys/:id/errors', authenticate, requireOrg('developer'), keysController.errors);

router.get('/budgets', authenticate, requireOrg('viewer'), budgetsController.list);
router.post('/budgets', authenticate, requireOrg('admin'), budgetsController.create);
router.patch('/budgets/:id', authenticate, requireOrg('admin'), budgetsController.update);
router.delete('/budgets/:id', authenticate, requireOrg('admin'), budgetsController.remove);

router.get('/wallet', authenticate, requireOrg('viewer'), walletController.get);
router.post('/wallet/topup', authenticate, requireOrg('owner'), walletController.topUp);

router.get('/filters', authenticate, requireOrg('admin'), filtersController.list);
router.post('/filters', authenticate, requireOrg('admin'), filtersController.create);
router.patch('/filters/:id', authenticate, requireOrg('admin'), filtersController.update);
router.delete('/filters/:id', authenticate, requireOrg('admin'), filtersController.remove);
router.post('/filters/test', authenticate, requireOrg('admin'), filtersController.test);
router.get('/filters/audits', authenticate, requireOrg('admin'), async (ctx) => {
  const page = parseInt(String(ctx.query.page || '1'), 10) || 1;
  const limit = parseInt(String(ctx.query.limit || '50'), 10) || 50;
  const { filterService } = await import('../services/filter.service');
  ctx.status = 200;
  ctx.body = {
    success: true,
    data: await filterService.listAudits(ctx.state.orgId!, { page, limit }),
  };
});
router.get('/filters/stats', authenticate, requireOrg('admin'), async (ctx) => {
  const days = Math.min(parseInt(String(ctx.query.days || '14'), 10) || 14, 90);
  const { filterService } = await import('../services/filter.service');
  ctx.status = 200;
  ctx.body = {
    success: true,
    data: await filterService.blockStats(ctx.state.orgId!, days),
  };
});

router.get('/logs', authenticate, requireOrg('viewer'), logsController.list);
router.get('/metrics/dashboard', authenticate, requireOrg('viewer'), metricsController.dashboard);
router.get('/metrics/tags', authenticate, requireOrg('viewer'), attributionController.tags);
router.get(
  '/metrics/end-users',
  authenticate,
  requireOrg('viewer'),
  attributionController.endUsersMetrics,
);
router.get('/end-users', authenticate, requireOrg('admin'), attributionController.listEndUsers);
router.post(
  '/end-users/:id/block',
  authenticate,
  requireOrg('admin'),
  attributionController.blockEndUser,
);

router.get('/audit', authenticate, requireOrg('viewer'), auditController.list);
router.get('/audit/export.csv', authenticate, requireOrg('admin'), auditController.exportCsv);

router.get('/guardrails', authenticate, requireOrg('admin'), guardrailsController.list);
router.post('/guardrails/bind', authenticate, requireOrg('admin'), guardrailsController.bind);
router.post('/guardrails/test', authenticate, requireOrg('admin'), guardrailsController.test);

router.get('/access-groups', authenticate, requireOrg('admin'), accessGroupsController.list);
router.post('/compliance/export', authenticate, requireOrg('owner'), complianceController.export);

router.get('/models', authenticate, requireOrg('viewer'), modelsController.list);

router.get('/members', authenticate, requireOrg('viewer'), membersController.list);
router.post('/members/invite', authenticate, requireOrg('admin'), membersController.invite);
router.post('/members/invite/:token/accept', authenticate, membersController.acceptInvite);

export default router;
