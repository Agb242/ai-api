import { Context } from 'koa';
import { agentService } from '../services/agent.service';
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

export const agentController = {
  async templates(ctx: Context) {
    const templates = await agentService.listTemplates();
    ok(
      ctx,
      templates.map((tpl) => ({
        id: tpl.id,
        key: tpl.key,
        metier: tpl.metier,
        icon: tpl.icon,
        default_name: tpl.default_name,
        description: tpl.description,
        system_prompt: tpl.system_prompt,
        disclaimer: tpl.disclaimer ?? null,
        starters: tpl.starters ?? [],
      })),
    );
  },

  async list(ctx: Context) {
    const agents = await agentService.listForOrg(ctx.state.orgId!);
    ok(ctx, agents);
  },

  async create(ctx: Context) {
    const body = (ctx.request.body || {}) as {
      template_id?: string;
      name?: string;
      system_prompt?: string;
      model_id?: string;
      temperature?: number;
      max_tokens?: number;
    };
    if (!body.name?.trim() || !body.system_prompt?.trim() || !body.model_id) {
      return fail(ctx, 'MISSING_FIELDS', 400);
    }

    try {
      const agent = await agentService.create({
        organizationId: ctx.state.orgId!,
        userId: ctx.state.user!.id,
        templateId: body.template_id || null,
        name: body.name,
        systemPrompt: body.system_prompt,
        modelId: body.model_id,
        temperature: body.temperature,
        maxTokens: body.max_tokens,
      });
      ok(ctx, agent, 201);
    } catch (err: any) {
      const code = err.code || 'PROVIDER_ERROR';
      if (code === 'AGENT_TEMPLATE_NOT_FOUND') return fail(ctx, code, 404);
      if (code === 'MODEL_NOT_FOUND') return fail(ctx, code, 400);
      if (code === 'MISSING_FIELDS') return fail(ctx, code, 400);
      logger.error('Agent create error', { code, message: err.message });
      fail(ctx, 'PROVIDER_ERROR', 502);
    }
  },

  async remove(ctx: Context) {
    const removed = await agentService.remove(ctx.state.orgId!, ctx.state.user!.id, ctx.params.id);
    if (!removed) return fail(ctx, 'AGENT_NOT_FOUND', 404);
    ok(ctx, { removed: true });
  },

  async listMcpServers(ctx: Context) {
    const servers = await mcpRegistryService.listForAgent(ctx.state.orgId!, ctx.params.id);
    ok(ctx, servers);
  },

  async attachMcpServer(ctx: Context) {
    const body = (ctx.request.body || {}) as { mcp_server_id?: string };
    if (!body.mcp_server_id) return fail(ctx, 'MISSING_FIELDS', 400);
    try {
      const server = await mcpRegistryService.attachToAgent(
        ctx.state.orgId!,
        ctx.params.id,
        body.mcp_server_id,
      );
      ok(ctx, server, 201);
    } catch (err: any) {
      const code = err.code || 'MCP_SERVER_NOT_FOUND';
      fail(ctx, code, code === 'MCP_SERVER_NOT_FOUND' ? 404 : 502);
    }
  },

  async detachMcpServer(ctx: Context) {
    await mcpRegistryService.detachFromAgent(ctx.params.id, ctx.params.mcpServerId);
    ok(ctx, { detached: true });
  },

  async chatCompletions(ctx: Context) {
    const locale = (ctx.state.locale || 'fr') as 'fr' | 'en';
    const body = (ctx.request.body || {}) as any;
    const apiKeyId = String(body.api_key_id || '');

    if (!apiKeyId || !Array.isArray(body.messages) || body.messages.length === 0) {
      return fail(ctx, 'MISSING_FIELDS', 400);
    }

    try {
      const result = await agentService.chatCompletions({
        organizationId: ctx.state.orgId!,
        locale,
        agentId: ctx.params.id,
        apiKeyId,
        messages: body.messages,
      });
      ok(ctx, result);
    } catch (err: any) {
      const code = err.code || 'PROVIDER_ERROR';
      if (code === 'AGENT_NOT_FOUND') return fail(ctx, code, 404);
      if (code === 'NOT_FOUND') return fail(ctx, code, 404);
      if (code === 'KEY_DISABLED' || code === 'KEY_REVOKED') return fail(ctx, code, 403);
      if (code === 'KEY_PLAINTEXT_UNAVAILABLE') return fail(ctx, code, 400);
      if (code === 'REQUEST_BLOCKED') return fail(ctx, code, 422, { rule: err.ruleName || 'filter' });
      if (code === 'INSUFFICIENT_BALANCE') return fail(ctx, code, 402);
      if (code === 'KEY_BUDGET_EXCEEDED' || code === 'ORG_BUDGET_EXCEEDED') return fail(ctx, code, 402);
      if (code === 'MODEL_UNAVAILABLE') return fail(ctx, code, 503);
      if (code === 'LITELLM_UNAVAILABLE' || code === 'LITELLM_NOT_CONFIGURED') {
        return fail(ctx, code, 503);
      }
      if (code === 'PROVIDER_ERROR' && err.status) {
        ctx.status = err.status;
        ctx.body = err.data ?? { success: false, error: { message: t(locale, code), code } };
        return;
      }
      logger.error('Agent chat error', { code, message: err.message });
      fail(ctx, 'PROVIDER_ERROR', 502);
    }
  },
};
