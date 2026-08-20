import Router from '@koa/router';
import { authenticate } from '../middleware/auth.middleware';
import { requireOrg } from '../middleware/org.middleware';
import { mcpController } from '../controllers/mcp.controller';

const router = new Router({ prefix: '/mcp-servers' });

// Storing a bearer token for a third-party tool server is sensitive — admin only.
router.get('/', authenticate, requireOrg('viewer'), mcpController.list);
router.post('/', authenticate, requireOrg('admin'), mcpController.create);
router.delete('/:id', authenticate, requireOrg('admin'), mcpController.remove);
router.post('/:id/tools', authenticate, requireOrg('viewer'), mcpController.testConnection);

export default router;
