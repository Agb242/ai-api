import { LlmModel } from '../models/LlmModel';
import { RequestLog } from '../models/RequestLog';
import { ApiKey } from '../models/ApiKey';
import { Organization } from '../models/Organization';
import { apiKeyService } from './api-key.service';
import { walletService } from './wallet.service';
import { filterService, FilterResult } from './filter.service';
import { llmRouter, ChatCompletionRequest, extractUsage } from './llm/router';
import {
  EndpointClass,
  ClassifiedEndpoint,
  estimateTokensForClass,
} from './llm/endpoint-class';
import { budgetService } from './budget.service';
import { guardrailService } from './catalog.service';
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
  return estimateTokensForClass('chat', body as Record<string, unknown>);
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

export interface GatewayContext {
  apiKey: ApiKey;
  organization: Organization;
  locale: 'fr' | 'en';
}

function modelIdFromBody(body: Record<string, unknown> | null | undefined): string | null {
  if (!body) return null;
  if (typeof body.model === 'string' && body.model) return body.model;
  return null;
}

export const gatewayService = {
  async prepare(ctx: GatewayContext, body: ChatCompletionRequest) {
    return this.prepareForClass(ctx, {
      class: 'chat',
      upstreamPath: '/v1/chat/completions',
      applyFilters: true,
      binaryResponse: false,
      multipart: false,
    }, body as Record<string, unknown>);
  },

  async prepareForClass(
    ctx: GatewayContext,
    classified: ClassifiedEndpoint,
    body: Record<string, unknown> | null | undefined,
  ) {
    const { apiKey, organization } = ctx;

    if (apiKeyService.isBudgetExceeded(apiKey)) {
      throw Object.assign(new Error('KEY_BUDGET_EXCEEDED'), { code: 'KEY_BUDGET_EXCEEDED' });
    }

    if (await budgetService.isOrgBudgetBlocked(organization.id)) {
      throw Object.assign(new Error('ORG_BUDGET_EXCEEDED'), { code: 'ORG_BUDGET_EXCEEDED' });
    }

    const modelId = modelIdFromBody(body);
    let model: LlmModel | null = null;
    if (modelId) {
      model = await resolveModel(modelId, organization);
    }

    const estimatedTokens = estimateTokensForClass(
      classified.class,
      body || undefined,
    );
    const estimatedCost = model
      ? estimateCost(model, estimatedTokens, Math.ceil(estimatedTokens / 2))
      : estimatedTokens * 0.00001;

    await walletService.assertAffordable(organization.id, estimatedCost);

    let filterResult: FilterResult = { action: 'pass', content: '' };
    let payload: Record<string, unknown> = { ...(body || {}) };

    if (classified.applyFilters && body) {
      const evaluated = await filterService.evaluate(organization.id, body);
      filterResult = evaluated.result;
      payload = evaluated.payload as Record<string, unknown>;

      if (filterResult.action === 'block' && filterResult.rule) {
        const rule = filterResult.rule;
        const log = await RequestLog.query().insert({
          organization_id: organization.id,
          api_key_id: apiKey.id,
          model_uuid: model?.id || null,
          model_id: model?.model_id || modelId || null,
          tokens_input: 0,
          tokens_output: 0,
          cost: 0,
          status: 'blocked',
          triggered_rule_id: rule.id,
          filter_action: 'block',
          streamed: !!(body as any).stream,
        });
        await filterService.audit({
          organizationId: organization.id,
          ruleId: rule.id,
          action: 'block',
          requestLogId: log.id,
        });
        throw Object.assign(new Error('REQUEST_BLOCKED'), {
          code: 'REQUEST_BLOCKED',
          ruleName: rule.name,
          logId: log.id,
        });
      }
    }

    // Enterprise LiteLLM guardrail (best-effort, after local filters)
    if (classified.applyFilters && body) {
      const text =
        filterResult.content ||
        (typeof (payload as any).prompt === 'string'
          ? (payload as any).prompt
          : JSON.stringify(payload).slice(0, 4000));
      const blocked = await guardrailService.shouldBlock(organization.id, text);
      if (blocked) {
        const log = await RequestLog.query().insert({
          organization_id: organization.id,
          api_key_id: apiKey.id,
          model_uuid: model?.id || null,
          model_id: model?.model_id || modelId || null,
          tokens_input: 0,
          tokens_output: 0,
          cost: 0,
          status: 'blocked',
          filter_action: 'block',
          error_code: 'GUARDRAIL',
          streamed: !!(body as any).stream,
        });
        const { auditService } = await import('./audit.service');
        await auditService.record({
          organizationId: organization.id,
          action: 'guardrail.block',
          resourceType: 'request_log',
          resourceId: log.id,
        });
        throw Object.assign(new Error('REQUEST_BLOCKED'), {
          code: 'REQUEST_BLOCKED',
          ruleName: 'enterprise_guardrail',
          logId: log.id,
        });
      }
    }

    return {
      model,
      payload,
      filterResult,
      endpointClass: classified.class as EndpointClass,
    };
  },

  async finalize(params: {
    organization: Organization;
    apiKey: ApiKey;
    model: LlmModel | null;
    body: Record<string, unknown>;
    responseData: unknown;
    latencyMs: number;
    backend: string;
    filterAction?: string;
    ruleId?: string;
    status?: string;
    errorCode?: string;
    modelIdFallback?: string;
    endUserId?: string | null;
  }) {
    const usage = extractUsage(params.responseData);
    const cost = params.model
      ? estimateCost(params.model, usage.input, usage.output)
      : 0;

    if (cost > 0 && params.status !== 'error' && params.status !== 'blocked') {
      try {
        await walletService.debit(params.organization.id, cost, {
          model: params.model?.model_id || params.modelIdFallback || 'unknown',
        });
        await apiKeyService.addBudgetConsumed(params.apiKey.id, cost);
      } catch (err) {
        logger.error('Failed to debit wallet after successful completion', { err });
      }
    }

    const metadata: Record<string, unknown> = {};
    if (params.endUserId) metadata.end_user_id = params.endUserId;

    const log = await RequestLog.query().insert({
      organization_id: params.organization.id,
      api_key_id: params.apiKey.id,
      model_uuid: params.model?.id || null,
      model_id: params.model?.model_id || params.modelIdFallback || null,
      tokens_input: usage.input,
      tokens_output: usage.output,
      latency_ms: params.latencyMs,
      cost,
      status: params.status || 'success',
      error_code: params.errorCode || null,
      triggered_rule_id: params.ruleId || null,
      filter_action: params.filterAction || null,
      router_backend: params.backend,
      streamed: !!params.body.stream,
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
