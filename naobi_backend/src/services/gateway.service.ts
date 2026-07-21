import { LlmModel } from '../models/LlmModel';
import { RequestLog } from '../models/RequestLog';
import { ApiKey } from '../models/ApiKey';
import { Organization } from '../models/Organization';
import { apiKeyService } from './api-key.service';
import { walletService } from './wallet.service';
import { filterService } from './filter.service';
import { ChatCompletionRequest, extractUsage } from './llm/router';
import type { ClassifiedEndpoint, EndpointClass } from './llm/endpoint-class';
import logger from '../config/logger';

export function estimateCost(
  model: LlmModel,
  inputTokens: number,
  outputTokens: number,
): number {
  const inPrice = Number(model.price_input_per_1k);
  const outPrice = Number(model.price_output_per_1k);
  return (inputTokens / 1000) * inPrice + (outputTokens / 1000) * outPrice;
}

/** Rough pre-check estimate from message sizes (chars/4 ≈ tokens). */
export function estimateInputTokens(body: ChatCompletionRequest): number {
  const messages = (body.messages || []) as Array<{ content?: unknown }>;
  if (messages.length) {
    const text = messages
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')))
      .join('');
    return Math.max(32, Math.ceil(text.length / 4));
  }
  return estimateTokensForClass('chat', body);
}

export function estimateTokensForClass(endpointClass: EndpointClass, body: unknown): number {
  const b = (body || {}) as Record<string, unknown>;
  switch (endpointClass) {
    case 'embeddings':
    case 'moderations': {
      const input = b.input;
      const text = Array.isArray(input)
        ? input.map((x) => String(x)).join('')
        : typeof input === 'string'
          ? input
          : '';
      return Math.max(16, Math.ceil(text.length / 4));
    }
    case 'rerank': {
      const docs = (b.documents || b.docs || []) as unknown[];
      const q = String(b.query || '');
      const docText = docs.map((d) => (typeof d === 'string' ? d : JSON.stringify(d))).join('');
      return Math.max(32, Math.ceil((q.length + docText.length) / 4));
    }
    case 'images':
      return 256; // flat heuristic; LiteLLM spend sync is source of truth
    case 'audio':
      return 128;
    case 'files':
    case 'batches':
      return 0;
    case 'completions': {
      const prompt = typeof b.prompt === 'string' ? b.prompt : JSON.stringify(b.prompt || '');
      return Math.max(32, Math.ceil(prompt.length / 4));
    }
    case 'anthropic':
    case 'responses':
    case 'google':
    case 'chat':
    default: {
      const messages = (b.messages || []) as Array<{ content?: unknown }>;
      if (messages.length) {
        const text = messages
          .map((m) =>
            typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''),
          )
          .join('');
        return Math.max(32, Math.ceil(text.length / 4));
      }
      if (typeof b.input === 'string') return Math.max(32, Math.ceil(b.input.length / 4));
      if (typeof b.prompt === 'string') return Math.max(32, Math.ceil(b.prompt.length / 4));
      return 64;
    }
  }
}

export async function resolveModel(
  modelId: string,
  _org: Organization,
): Promise<LlmModel> {
  const existing = await LlmModel.query().findOne({ model_id: modelId });
  if (existing) {
    if (existing.status === 'deprecated' || existing.status === 'testing') {
      throw Object.assign(new Error('MODEL_NOT_FOUND'), { code: 'MODEL_NOT_FOUND' });
    }
    if (existing.status === 'degraded') {
      throw Object.assign(new Error('MODEL_UNAVAILABLE'), { code: 'MODEL_UNAVAILABLE' });
    }
    return existing;
  }

  try {
    return await LlmModel.query().insertAndFetch({
      provider: 'litellm',
      model_id: modelId,
      display_name: modelId,
      type: 'hosted',
      price_input_per_1k: 0,
      price_output_per_1k: 0,
      status: 'available',
    });
  } catch {
    const again = await LlmModel.query().findOne({ model_id: modelId });
    if (again) return again;
    throw Object.assign(new Error('MODEL_NOT_FOUND'), { code: 'MODEL_NOT_FOUND' });
  }
}

/** Placeholder model row when endpoint has no model (files/batches). */
async function resolveOptionalModel(
  modelId: string | undefined,
  org: Organization,
): Promise<LlmModel | null> {
  if (!modelId) return null;
  return resolveModel(modelId, org);
}

export interface GatewayContext {
  apiKey: ApiKey;
  organization: Organization;
  locale: 'fr' | 'en';
}

export const gatewayService = {
  async prepare(ctx: GatewayContext, body: ChatCompletionRequest) {
    return this.prepareForClass(ctx, body, {
      class: 'chat',
      applyFilters: true,
      requireModel: true,
      binaryResponse: false,
      multipart: false,
    });
  },

  async prepareForClass(
    ctx: GatewayContext,
    body: Record<string, unknown>,
    classified: ClassifiedEndpoint,
  ) {
    const { apiKey, organization } = ctx;

    if (apiKeyService.isBudgetExceeded(apiKey)) {
      throw Object.assign(new Error('KEY_BUDGET_EXCEEDED'), { code: 'KEY_BUDGET_EXCEEDED' });
    }

    const { budgetService } = await import('./budget.service');
    await budgetService.assertOrgAffordable(organization.id);

    const modelId =
      (typeof body.model === 'string' && body.model) ||
      (typeof body.model_id === 'string' && body.model_id) ||
      undefined;

    if (classified.requireModel && !modelId) {
      throw Object.assign(new Error('MISSING_FIELDS'), { code: 'MISSING_FIELDS' });
    }

    const model = await resolveOptionalModel(modelId, organization);
    const estimatedTokens = estimateTokensForClass(classified.class, body);
    const estimatedCost = model
      ? estimateCost(model, estimatedTokens, estimatedTokens)
      : 0;

    if (estimatedCost > 0) {
      await walletService.assertAffordable(organization.id, estimatedCost);
    }

    let payload: Record<string, unknown> = body;
    let filterResult: { action: 'pass' | 'block' | 'redact'; rule?: { id: string; name: string } } = {
      action: 'pass',
    };

    if (classified.applyFilters && !classified.multipart) {
      const evaluated = await filterService.evaluateWithGuardrails(organization, body);
      filterResult = evaluated.result;
      payload = evaluated.payload as Record<string, unknown>;

      if (filterResult.action === 'block' && filterResult.rule) {
        const log = await RequestLog.query().insert({
          organization_id: organization.id,
          api_key_id: apiKey.id,
          model_uuid: model?.id || null,
          model_id: model?.model_id || modelId || null,
          tokens_input: 0,
          tokens_output: 0,
          cost: 0,
          status: 'blocked',
          triggered_rule_id:
            filterResult.rule.id && !String(filterResult.rule.id).startsWith('guardrail:')
              ? filterResult.rule.id
              : null,
          filter_action: 'block',
          streamed: !!body.stream,
          metadata: { source: filterResult.rule.name?.startsWith('guardrail:') ? 'guardrail' : 'filter' },
        });
        if (filterResult.rule.id && !String(filterResult.rule.id).startsWith('guardrail:')) {
          await filterService.audit({
            organizationId: organization.id,
            ruleId: filterResult.rule.id,
            action: 'block',
            requestLogId: log.id,
          });
        }
        throw Object.assign(new Error('REQUEST_BLOCKED'), {
          code: 'REQUEST_BLOCKED',
          ruleName: filterResult.rule.name,
          logId: log.id,
        });
      }
    }

    return {
      model,
      payload: payload as ChatCompletionRequest & Record<string, unknown>,
      filterResult,
      endpointClass: classified.class,
    };
  },

  async finalize(params: {
    organization: Organization;
    apiKey: ApiKey;
    model: LlmModel | null;
    body: ChatCompletionRequest | Record<string, unknown>;
    responseData: unknown;
    latencyMs: number;
    backend: string;
    filterAction?: string;
    ruleId?: string;
    status?: string;
    errorCode?: string;
    endpointClass?: EndpointClass;
    attribution?: { end_user_id?: string; tags?: string[] };
  }) {
    const usage = extractUsage(params.responseData);
    const cost = params.model
      ? estimateCost(params.model, usage.input, usage.output)
      : 0;

    if (cost > 0 && params.status !== 'error' && params.status !== 'blocked') {
      try {
        await walletService.debit(params.organization.id, cost, {
          model: params.model?.model_id || 'unknown',
        });
        await apiKeyService.addBudgetConsumed(params.apiKey.id, cost);
        const { budgetService } = await import('./budget.service');
        await budgetService.addConsumed(params.organization.id, cost);
      } catch (err) {
        logger.error('Failed to debit wallet after successful completion', { err });
      }
    }

    const metadata: Record<string, unknown> = {
      ...(params.endpointClass ? { endpoint_class: params.endpointClass } : {}),
      ...(params.attribution?.end_user_id
        ? { end_user_id: params.attribution.end_user_id }
        : {}),
      ...(params.attribution?.tags?.length ? { tags: params.attribution.tags } : {}),
    };

    const log = await RequestLog.query().insert({
      organization_id: params.organization.id,
      api_key_id: params.apiKey.id,
      model_uuid: params.model?.id || null,
      model_id: params.model?.model_id || (params.body as any)?.model || null,
      tokens_input: usage.input,
      tokens_output: usage.output,
      latency_ms: params.latencyMs,
      cost,
      status: params.status || 'success',
      error_code: params.errorCode || null,
      triggered_rule_id:
        params.ruleId && !String(params.ruleId).startsWith('guardrail:')
          ? params.ruleId
          : null,
      filter_action: params.filterAction || null,
      router_backend: params.backend,
      streamed: !!(params.body as any)?.stream,
      metadata,
    });

    return { log, cost, usage };
  },

  async logError(params: {
    organization: Organization;
    apiKey: ApiKey;
    model?: LlmModel | null;
    modelId?: string;
    latencyMs: number;
    errorCode: string;
    streamed?: boolean;
  }) {
    return RequestLog.query().insert({
      organization_id: params.organization.id,
      api_key_id: params.apiKey.id,
      model_uuid: params.model?.id || null,
      model_id: params.model?.model_id || params.modelId || null,
      tokens_input: 0,
      tokens_output: 0,
      latency_ms: params.latencyMs,
      cost: 0,
      status: 'error',
      error_code: params.errorCode,
      streamed: !!params.streamed,
    });
  },
};
