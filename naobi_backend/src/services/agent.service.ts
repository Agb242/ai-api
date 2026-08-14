import { AgentTemplate } from '../models/AgentTemplate';
import { Agent } from '../models/Agent';
import { Organization } from '../models/Organization';
import { apiKeyService } from './api-key.service';
import { catalogService } from './catalog.service';
import { gatewayService } from './gateway.service';
import { llmRouter, extractUsage } from './llm/router';
import { auditService } from './audit.service';

/** Compose the final system prompt: template base + tone/language + disclaimer reminder. */
function buildSystemPrompt(
  basePrompt: string,
  tone: string,
  language: string,
  disclaimer?: string | null,
): string {
  let prompt = `${basePrompt}\n\nTon à adopter : ${tone}. Réponds toujours en ${language}, sauf si l'utilisateur écrit clairement dans une autre langue.`;
  if (disclaimer) prompt += `\n\nRappel important à respecter strictement : ${disclaimer}`;
  return prompt;
}

function publicAgentFields(agent: Agent) {
  return {
    id: agent.id,
    template_id: agent.template_id ?? null,
    metier: agent.metier,
    icon: agent.icon,
    name: agent.name,
    model_id: agent.model_id,
    tone: agent.tone,
    language: agent.language,
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

  async create(params: {
    organizationId: string;
    userId: string;
    templateId: string;
    name?: string;
    tone?: string;
    language?: string;
    modelId: string;
  }) {
    const template = await AgentTemplate.query().findOne({
      id: params.templateId,
      active: true,
    });
    if (!template) {
      throw Object.assign(new Error('AGENT_TEMPLATE_NOT_FOUND'), {
        code: 'AGENT_TEMPLATE_NOT_FOUND',
      });
    }

    const allowlist = await catalogService.getAllowedModelsForOrg(params.organizationId);
    catalogService.assertModelsAllowed([params.modelId], allowlist);

    const tone = (params.tone || template.tone_default || 'amical').trim();
    const language = (params.language || 'français').trim();
    const name = (params.name || template.default_name).trim().slice(0, 60) || template.default_name;

    const agent = await Agent.query().insert({
      organization_id: params.organizationId,
      created_by: params.userId,
      template_id: template.id,
      metier: template.metier,
      icon: template.icon,
      name,
      model_id: params.modelId,
      tone,
      language,
      system_prompt: buildSystemPrompt(template.system_prompt, tone, language, template.disclaimer),
      disclaimer: template.disclaimer ?? null,
      starters: template.starters ?? [],
    } as any);

    await auditService.record({
      organizationId: params.organizationId,
      actorUserId: params.userId,
      action: 'agent.create',
      resourceType: 'agent',
      resourceId: agent.id,
      metadata: { metier: template.metier, model_id: params.modelId },
    });

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
   * Chat with an agent: injects its system prompt, then reuses the same wallet/budget/filter
   * pipeline as the raw Playground (gatewayService.prepare/finalize) so spend, guardrails and
   * request logs behave identically. Non-streaming only for this first iteration.
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

    const started = Date.now();
    const chatBody = {
      model: agent.model_id,
      messages: [{ role: 'system', content: agent.system_prompt }, ...params.messages],
      stream: false,
    };

    const { model, payload, filterResult } = await gatewayService.prepare(
      { apiKey: key, organization, locale: params.locale },
      chatBody,
    );
    if (!model) throw Object.assign(new Error('MISSING_FIELDS'), { code: 'MISSING_FIELDS' });

    const virtualKey = apiKeyService.resolveVirtualKeyPlaintext(key);
    if (!virtualKey) {
      throw Object.assign(new Error('KEY_PLAINTEXT_UNAVAILABLE'), {
        code: 'KEY_PLAINTEXT_UNAVAILABLE',
      });
    }

    const result = await llmRouter.forward(payload as any, model, { bearerKey: virtualKey });
    const latencyMs = Date.now() - started;

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
    const content =
      (base as any)?.choices?.[0]?.message?.content || '';

    return {
      content,
      model: (base as any)?.model || agent.model_id,
      usage: { prompt_tokens: usage.input, completion_tokens: usage.output },
    };
  },
};
