import Router from '@koa/router';
import { filesService } from '../services/files.service';

/**
 * Serves files produced by native agent tools (e.g. generated PDFs) so they can be
 * opened directly from a chat message link. Unauthenticated by design — IDs are random
 * UUIDs (unguessable) and content is read-only; revisit if these ever carry sensitive data.
 */
const router = new Router();

router.get('/files/:id', async (ctx) => {
  const file = await filesService.get(ctx.params.id);
  if (!file) {
    ctx.status = 404;
    ctx.body = { error: { message: 'Fichier introuvable', code: 'NOT_FOUND' } };
    return;
  }

  ctx.set('Content-Type', file.mime_type);
  ctx.set('Content-Disposition', `inline; filename="${file.filename}"`);
  ctx.body = file.content;
});

export default router;
