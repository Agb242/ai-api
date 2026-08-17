import { Context } from 'koa';
import { mcpRegistryService } from '../services/mcp-registry.service';
import { t } from '../i18n/messages';
import logger from '../config/logger';

function ok(ctx: Context, data: unknown, status = 200) {
  ctx.status = status;
  ctx.body = { success: true, data };
}

function fail(ctx: Context, code: string, status: number, vars?: Record<string, string>) {
  const locale = ctx.state.locale || 'fr';
  ctx.status = status;
  ctx.body = { success: false, error: { message: t(locale, code, vars), code } };
}

export const mcpController = {
  async list(ctx: Context) {
    const servers = await mcpRegistryService.listForOrg(ctx.state.orgId!);
    ok(ctx, servers);
  },

  async create(ctx: Context) {
    const body = (ctx.request.body || {}) as {
      name?: string;
      url?: string;
      auth_type?: 'none' | 'bearer';
      bearer_token?: string;
      headers?: Record<string, string>;
    };
    if (!body.name?.trim() || !body.url?.trim()) {
      return fail(ctx, 'MISSING_FIELDS', 400);
    }

    try {
      const server = await mcpRegistryService.create({
        organizationId: ctx.state.orgId!,
        userId: ctx.state.user!.id,
        name: body.name,
        url: body.url,
        authType: body.auth_type === 'bearer' ? 'bearer' : 'none',
        bearerToken: body.bearer_token,
        headers: body.headers,
      });
      ok(ctx, server, 201);
    } catch (err: any) {
      logger.error('MCP server create error', { message: err.message });
      fail(ctx, 'PROVIDER_ERROR', 502);
    }
  },

  async remove(ctx: Context) {
    const removed = await mcpRegistryService.remove(
      ctx.state.orgId!,
      ctx.state.user!.id,
      ctx.params.id,
    );
    if (!removed) return fail(ctx, 'MCP_SERVER_NOT_FOUND', 404);
    ok(ctx, { removed: true });
  },

  async testConnection(ctx: Context) {
    try {
      const tools = await mcpRegistryService.testConnection(ctx.state.orgId!, ctx.params.id);
      ok(ctx, { tools });
    } catch (err: any) {
      const code = err.code || 'MCP_CONNECTION_FAILED';
      if (code === 'MCP_SERVER_NOT_FOUND') return fail(ctx, code, 404);
      fail(ctx, 'MCP_CONNECTION_FAILED', 502);
    }
  },
};
