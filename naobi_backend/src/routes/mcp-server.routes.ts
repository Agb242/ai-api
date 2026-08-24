import Router from '@koa/router';
import { z } from 'zod';
import { McpServer as SdkMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { apiKeyAuth } from '../middleware/api-key.middleware';
import { agentService } from '../services/agent.service';
import logger from '../config/logger';

/**
 * Naobi exposed as an MCP server: any MCP-compatible client (Claude Desktop, LobeChat,
 * Cursor, …) can authenticate with a Naobi API key and use our own métier agents as tools.
 * Stateless Streamable HTTP: a fresh SDK server + transport is created per request, scoped
 * to the caller's organization — no shared session state to manage across requests.
 */
const router = new Router();

// Declared at module scope (not inline in the registerTool call) so TypeScript resolves
// this shape once, instead of re-inferring it inline in the generic call's context.
const chatWithAgentInputSchema = {
  agent_id: z.string().describe('Identifiant de l’agent (voir list_agents).'),
  message: z.string().describe("Message à envoyer à l'agent."),
};

function buildMcpServer(orgId: string, apiKeyId: string) {
  const server = new SdkMcpServer({ name: 'knotflow', version: '1.0.0' });

  server.registerTool(
    'list_agent_templates',
    {
      description:
        "Liste la bibliothèque de métiers Naobi (service client, comptabilité, RH, marketing…) disponibles pour créer un agent IA spécialisé.",
      inputSchema: {},
    },
    async () => {
      const templates = await agentService.listTemplates();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              templates.map((t) => ({
                id: t.id,
                metier: t.metier,
                description: t.description,
              })),
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'list_agents',
    {
      description: "Liste les agents IA déjà créés dans l'organisation Naobi de l'appelant.",
      inputSchema: {},
    },
    async () => {
      const agents = await agentService.listForOrg(orgId);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              agents.map((a) => ({ id: a.id, name: a.name, metier: a.metier })),
            ),
          },
        ],
      };
    },
  );

  // registerTool's Zod-shape generic overload sends `tsc` into TS2589 ("type instantiation
  // excessively deep") once combined with agentService's own inferred types elsewhere in
  // this compilation — reproducible even with an explicit return type or a hoisted schema
  // const. Runtime behavior is unaffected (the SDK still validates `args` against the Zod
  // shape at request time); this `any` only drops compile-time inference for this one call.
  (server.registerTool as any)(
    'chat_with_agent',
    {
      description:
        "Envoie un message à un agent Naobi (par ex. l'assistant comptable ou service client de l'organisation) et renvoie sa réponse.",
      inputSchema: chatWithAgentInputSchema,
    },
    async (args: { agent_id: string; message: string }): Promise<CallToolResult> => {
      try {
        const result = await agentService.chatCompletions({
          organizationId: orgId,
          locale: 'fr',
          agentId: args.agent_id,
          apiKeyId,
          messages: [{ role: 'user', content: args.message }],
        });
        return { content: [{ type: 'text' as const, text: result.content }] };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Erreur : ${err.message || 'échec inconnu'}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

router.post('/mcp', apiKeyAuth, async (ctx) => {
  const orgId = ctx.state.organization!.id;
  const apiKeyId = ctx.state.apiKey!.id;

  const server = buildMcpServer(orgId, apiKeyId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  ctx.respond = false;
  try {
    await server.connect(transport);
    await transport.handleRequest(ctx.req, ctx.res, ctx.request.body);
  } catch (err) {
    logger.error('MCP server request failed', { err: (err as Error).message });
    if (!ctx.res.headersSent) {
      ctx.res.statusCode = 500;
      ctx.res.end(JSON.stringify({ error: 'Internal MCP server error' }));
    }
  }
});

router.all(['/mcp'], async (ctx) => {
  // Stateless mode: no server-initiated streams (GET) and no session termination (DELETE).
  ctx.status = 405;
  ctx.body = { error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } };
});

export default router;
