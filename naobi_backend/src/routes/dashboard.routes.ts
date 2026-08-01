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
} from '../controllers/dashboard.controller';
import { budgetsController, analyticsController } from '../controllers/budgets.controller';

const router = new Router();

router.get('/organizations', authenticate, orgController.listMine);
router.post('/organizations', authenticate, orgController.create);

router.get('/keys', authenticate, requireOrg('developer'), keysController.list);
router.post('/keys', authenticate, requireOrg('developer'), keysController.create);
router.get('/keys/:id', authenticate, requireOrg('developer'), keysController.get);
router.patch('/keys/:id', authenticate, requireOrg('developer'), keysController.update);
router.post('/keys/:id/rotate', authenticate, requireOrg('admin'), keysController.rotate);
router.post('/keys/:id/reset-spend', authenticate, requireOrg('admin'), keysController.resetSpend);
router.post('/keys/:id/disable', authenticate, requireOrg('admin'), keysController.disable);
router.post('/keys/:id/enable', authenticate, requireOrg('admin'), keysController.enable);
router.post('/keys/:id/revoke', authenticate, requireOrg('admin'), keysController.revoke);
router.get('/keys/:id/metrics', authenticate, requireOrg('developer'), keysController.metrics);
router.get('/keys/:id/analytics', authenticate, requireOrg('developer'), keysController.analytics);
router.get('/keys/:id/usage', authenticate, requireOrg('developer'), keysController.usage);
router.get('/keys/:id/models', authenticate, requireOrg('developer'), keysController.models);
router.get('/keys/:id/providers', authenticate, requireOrg('developer'), keysController.providers);
router.get('/keys/:id/logs', authenticate, requireOrg('developer'), keysController.logs);
router.get('/keys/:id/errors', authenticate, requireOrg('developer'), keysController.errors);

router.get('/budgets', authenticate, requireOrg('admin'), budgetsController.list);
router.get('/budgets/active', authenticate, requireOrg('viewer'), budgetsController.getActive);
router.post('/budgets', authenticate, requireOrg('admin'), budgetsController.upsert);
router.patch('/budgets', authenticate, requireOrg('admin'), budgetsController.patch);

router.get('/analytics/spend-tags', authenticate, requireOrg('viewer'), analyticsController.spendTags);
router.get('/analytics/end-users', authenticate, requireOrg('viewer'), analyticsController.endUsers);

router.get('/wallet', authenticate, requireOrg('viewer'), walletController.get);
router.post('/wallet/topup', authenticate, requireOrg('owner'), walletController.topUp);

router.get('/filters', authenticate, requireOrg('admin'), filtersController.list);
router.post('/filters', authenticate, requireOrg('admin'), filtersController.create);
router.patch('/filters/:id', authenticate, requireOrg('admin'), filtersController.update);
router.delete('/filters/:id', authenticate, requireOrg('admin'), filtersController.remove);
router.post('/filters/test', authenticate, requireOrg('admin'), filtersController.test);

router.get('/logs', authenticate, requireOrg('viewer'), logsController.list);
router.get('/metrics/dashboard', authenticate, requireOrg('viewer'), metricsController.dashboard);
router.get('/models', authenticate, requireOrg('viewer'), modelsController.list);

router.get('/members', authenticate, requireOrg('viewer'), membersController.list);
router.post('/members/invite', authenticate, requireOrg('admin'), membersController.invite);
router.post('/members/invite/:token/accept', authenticate, membersController.acceptInvite);

export default router;
