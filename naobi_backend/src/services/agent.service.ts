import { AgentTemplate } from '../models/AgentTemplate';
import { Agent } from '../models/Agent';
import { Organization } from '../models/Organization';
import { apiKeyService } from './api-key.service';
import { catalogService } from './catalog.service';
import { gatewayService } from './gateway.service';
import { llmRouter, extractUsage } from './llm/router';
import { auditService } from './audit.service';
import { mcpRegistryService } from './mcp-registry.service';
import { nativeToolsService } from './native-tools.service';

/** Safety cap on the model↔tool round trip so a misbehaving tool can't loop forever. */
const MAX_TOOL_ROUNDS = 4;

type ChatMessage = { role: string; content?: string | null; [key: string]: unknown };

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function publicAgentFields(agent: Agent) {
  return {
    id: agent.id,
    template_id: agent.template_id ?? null,
    metier: agent.metier ?? null,
    icon: agent.icon,
    name: agent.name,
    model_id: agent.model_id,
    temperature: Number(agent.temperature),
    max_tokens: agent.max_tokens,
    system_prompt: agent.system_prompt,
    disclaimer: agent.disclaimer ?? null,
    starters: agent.starters ?? [],
    created_at: agent.created_at,
  };
}

export const agentService = {
  publicAgentFields,

  async listTemplates() {
    return AgentTemplate.query().where({ active: true }).orderBy('metier');
  },

  async listForOrg(organizationId: string) {
    const agents = await Agent.query()
      .where({ organization_id: organizationId })
      .modify('notDeleted')
      .orderBy('created_at', 'desc');
    return agents.map(publicAgentFields);
  },

  /**
   * Free-form agent creation — the direct LiteLLM/OpenAI chat-completions config surface
   * (system prompt, model, temperature, max_tokens), no mandatory métier template. A
   * `templateId` may still be passed to carry over its métier/icon/disclaimer/starters as
   * optional flavor metadata (the frontend uses it as a prefill, not a gate).
   */
  async create(params: {
    organizationId: string;
    userId: string;
    name: string;
    systemPrompt: string;
    modelId: string;
    temperature?: number;
    maxTokens?: number;
    templateId?: string | null;
  }) {
    const allowlist = await catalogService.getAllowedModelsForOrg(params.organizationId);
    catalogService.assertModelsAllowed([params.modelId], allowlist);

    let template: AgentTemplate | undefined;
    if (params.templateId) {
      template =
        (await AgentTemplate.query().findOne({ id: params.templateId, active: true })) ||
        undefined;
      if (!template) {
        throw Object.assign(new Error('AGENT_TEMPLATE_NOT_FOUND'), {
          code: 'AGENT_TEMPLATE_NOT_FOUND',
        });
      }
    }

    const name = params.name.trim().slice(0, 60);
    if (!name) throw Object.assign(new Error('MISSING_FIELDS'), { code: 'MISSING_FIELDS' });
    const systemPrompt = params.systemPrompt.trim();
    if (!systemPrompt) throw Object.assign(new Error('MISSING_FIELDS'), { code: 'MISSING_FIELDS' });

    const temperature = clamp(params.temperature ?? 0.7, 0, 2);
    const maxTokens = clamp(Math.round(params.maxTokens ?? 1024), 1, 32000);

    const agent = await Agent.query().insert({
      organization_id: params.organizationId,
      created_by: params.userId,
      template_id: template?.id ?? null,
      metier: template?.metier ?? null,
      icon: template?.icon ?? '🤖',
      name,
      model_id: params.modelId,
      temperature,
      max_tokens: maxTokens,
      system_prompt: systemPrompt,
      disclaimer: template?.disclaimer ?? null,
      // knex only auto-JSON-encodes plain objects for jsonb columns, not arrays — stringify explicitly.
      starters: JSON.stringify(template?.starters ?? []),
    } as any);

    await auditService.record({
      organizationId: params.organizationId,
      actorUserId: params.userId,
      action: 'agent.create',
      resourceType: 'agent',
      resourceId: agent.id,
      metadata: { model_id: params.modelId, template_id: template?.id ?? null },
    });

    // The insert payload above stringifies `starters` for jsonb storage — restore the
    // real array on the in-memory instance before returning it to the caller.
    agent.starters = template?.starters ?? [];
    return publicAgentFields(agent);
  },

  async remove(organizationId: string, userId: string, agentId: string) {
    const agent = await Agent.query()
      .findOne({ id: agentId, organization_id: organizationId })
      .modify('notDeleted');
    if (!agent) return false;

    await agent.softDelete();
    await auditService.record({
      organizationId,
      actorUserId: userId,
      action: 'agent.delete',
      resourceType: 'agent',
      resourceId: agentId,
    });
    return true;
  },

  /**
   * Chat with an agent: injects its system prompt and, when tools are attached, runs an
   * agentic tool-calling loop — each model↔tool round trip reuses the same wallet/budget/
   * filter pipeline as the raw Playground (gatewayService.prepare/finalize), so spend,
   * guardrails and request logs behave identically per LLM call. Non-streaming.
   */
  async chatCompletions(params: {
    organizationId: string;
    locale: 'fr' | 'en';
    agentId: string;
    apiKeyId: string;
    messages: Array<{ role: string; content: string }>;
  }) {
    const agent = await Agent.query()
      .findOne({ id: params.agentId, organization_id: params.organizationId })
      .modify('notDeleted');
    if (!agent) {
      throw Object.assign(new Error('AGENT_NOT_FOUND'), { code: 'AGENT_NOT_FOUND' });
    }

    const key = await apiKeyService.getById(params.organizationId, params.apiKeyId);
    if (!key) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
    if (key.status !== 'active') {
      throw Object.assign(new Error(key.status === 'disabled' ? 'KEY_DISABLED' : 'KEY_REVOKED'), {
        code: key.status === 'disabled' ? 'KEY_DISABLED' : 'KEY_REVOKED',
      });
    }

    const organization = await Organization.query().findById(params.organizationId);
    if (!organization) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });

    const nativeToolDefs = nativeToolsService.list();
    const nativeToolsByName = new Map(nativeToolDefs.map((t) => [t.name, t]));
    const mcpToolDefs = await mcpRegistryService.listToolsForAgent(params.organizationId, agent.id);
    const mcpToolsByLlmName = new Map(mcpToolDefs.map((t) => [t.llmName, t]));

    const tools = [
      ...nativeToolDefs.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      })),
      ...mcpToolDefs.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.llmName,
          description: t.description || undefined,
          parameters: t.inputSchema,
        },
      })),
    ];

    /** One model call: prepare → forward → finalize, reusing the shared gateway pipeline. */
    const runOnce = async (chatMessages: ChatMessage[]) => {
      const started = Date.now();
      const chatBody: Record<string, unknown> = {
        model: agent.model_id,
        messages: chatMessages,
        stream: false,
        temperature: Number(agent.temperature),
        max_tokens: agent.max_tokens,
      };
      if (tools.length) {
        chatBody.tools = tools;
        chatBody.tool_choice = 'auto';
      }

      const { model, payload, filterResult } = await gatewayService.prepare(
        { apiKey: key, organization, locale: params.locale },
        chatBody as any,
      );
      if (!model) throw Object.assign(new Error('MISSING_FIELDS'), { code: 'MISSING_FIELDS' });

      const virtualKey = apiKeyService.resolveVirtualKeyPlaintext(key);
      if (!virtualKey) {
        throw Object.assign(new Error('KEY_PLAINTEXT_UNAVAILABLE'), {
          code: 'KEY_PLAINTEXT_UNAVAILABLE',
        });
      }

      let result = await llmRouter.forward(payload as any, model, { bearerKey: virtualKey });
      const latencyMs = Date.now() - started;

      // Agents remain useful on every chat model. Some providers expose a model in the
      // catalogue but reject OpenAI tool-calling parameters at runtime. In that case,
      // retry the exact same request without optional tools instead of failing the chat.
      if (result.status >= 400 && tools.length) {
        const plainPayload = { ...(payload as Record<string, unknown>) };
        delete plainPayload.tools;
        delete plainPayload.tool_choice;
        result = await llmRouter.forward(plainPayload as any, model, { bearerKey: virtualKey });
      }

      if (result.status >= 400) {
        await gatewayService.logError({
          organization,
          apiKey: key,
          model,
          latencyMs,
          errorCode: 'PROVIDER_ERROR',
        });
        const err = Object.assign(new Error('PROVIDER_ERROR'), { code: 'PROVIDER_ERROR' });
        (err as any).status = result.status;
        (err as any).data = result.data;
        throw err;
      }

      const usage = extractUsage(result.data);
      await gatewayService.finalize({
        organization,
        apiKey: key,
        model,
        body: payload,
        responseData: result.data,
        latencyMs,
        backend: result.backend,
        filterAction: filterResult.action === 'redact' ? 'redact' : undefined,
        ruleId: filterResult.rule?.id,
        status: filterResult.action === 'redact' ? 'redacted' : 'success',
      });

      const base =
        result.data && typeof result.data === 'object'
          ? (result.data as Record<string, unknown>)
          : {};
      return {
        message: ((base as any)?.choices?.[0]?.message || {}) as ChatMessage & {
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        },
        modelId: (base as any)?.model || agent.model_id,
        usage,
      };
    };

    const conversation: ChatMessage[] = [
      { role: 'system', content: agent.system_prompt },
      ...params.messages,
    ];

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let lastModelId = agent.model_id;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const { message, modelId, usage } = await runOnce(conversation);
      totalPromptTokens += usage.input;
      totalCompletionTokens += usage.output;
      lastModelId = modelId;

      const toolCalls = message.tool_calls || [];
      if (!toolCalls.length) {
        return {
          content: message.content || '',
          model: lastModelId,
          usage: { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens },
        };
      }

      conversation.push(message);
      for (const call of toolCalls) {
        const name = call.function.name;
        let content: string;
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          if (nativeToolsByName.has(name)) {
            content = await nativeToolsService.call(name, args, {
              organizationId: params.organizationId,
              agentId: agent.id,
            });
          } else {
            const tool = mcpToolsByLlmName.get(name);
            if (!tool) throw new Error(`outil "${name}" inconnu`);
            content = await mcpRegistryService.callTool(
              params.organizationId,
              tool.serverId,
              tool.toolName,
              args,
            );
          }
        } catch (err: any) {
          content = `Erreur lors de l'appel de l'outil "${name}" : ${err.message || 'échec inconnu'}.`;
        }
        conversation.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }

    // Ran out of rounds — return whatever the last assistant turn said, if anything.
    const lastAssistant = [...conversation].reverse().find((m) => m.role === 'assistant');
    return {
      content: (lastAssistant?.content as string) || '',
      model: lastModelId,
      usage: { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens },
    };
  },
};
