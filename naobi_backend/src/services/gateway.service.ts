import { LlmModel } from '../models/LlmModel';
import { RequestLog } from '../models/RequestLog';
import { ApiKey } from '../models/ApiKey';
import { Organization } from '../models/Organization';
import { apiKeyService } from './api-key.service';
import { walletService } from './wallet.service';
import { filterService } from './filter.service';
import { llmRouter, ChatCompletionRequest, extractUsage } from './llm/router';
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
  const text = messages
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')))
    .join('');
  return Math.max(32, Math.ceil(text.length / 4));
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

export const gatewayService = {
  async prepare(ctx: GatewayContext, body: ChatCompletionRequest) {
    const { apiKey, organization } = ctx;

    if (apiKeyService.isBudgetExceeded(apiKey)) {
      throw Object.assign(new Error('KEY_BUDGET_EXCEEDED'), { code: 'KEY_BUDGET_EXCEEDED' });
    }

    const model = await resolveModel(String(body.model), organization);
    const estimatedTokens = estimateInputTokens(body);
    const estimatedCost = estimateCost(model, estimatedTokens, estimatedTokens); // conservative

    await walletService.assertAffordable(organization.id, estimatedCost);

    const { result: filterResult, payload } = await filterService.evaluate(
      organization.id,
      body,
    );

    if (filterResult.action === 'block' && filterResult.rule) {
      const log = await RequestLog.query().insert({
        organization_id: organization.id,
        api_key_id: apiKey.id,
        model_uuid: model.id,
        model_id: model.model_id,
        tokens_input: 0,
        tokens_output: 0,
        cost: 0,
        status: 'blocked',
        triggered_rule_id: filterResult.rule.id,
        filter_action: 'block',
        streamed: !!body.stream,
      });
      await filterService.audit({
        organizationId: organization.id,
        ruleId: filterResult.rule.id,
        action: 'block',
        requestLogId: log.id,
      });
      throw Object.assign(new Error('REQUEST_BLOCKED'), {
        code: 'REQUEST_BLOCKED',
        ruleName: filterResult.rule.name,
        logId: log.id,
      });
    }

    return { model, payload: payload as ChatCompletionRequest, filterResult };
  },

  async finalize(params: {
    organization: Organization;
    apiKey: ApiKey;
    model: LlmModel;
    body: ChatCompletionRequest;
    responseData: unknown;
    latencyMs: number;
    backend: string;
    filterAction?: string;
    ruleId?: string;
    status?: string;
    errorCode?: string;
  }) {
    const usage = extractUsage(params.responseData);
    const cost = estimateCost(params.model, usage.input, usage.output);

    if (cost > 0 && params.status !== 'error' && params.status !== 'blocked') {
      try {
        await walletService.debit(params.organization.id, cost, {
          model: params.model.model_id,
        });
        await apiKeyService.addBudgetConsumed(params.apiKey.id, cost);
      } catch (err) {
        logger.error('Failed to debit wallet after successful completion', { err });
      }
    }

    const log = await RequestLog.query().insert({
      organization_id: params.organization.id,
      api_key_id: params.apiKey.id,
      model_uuid: params.model.id,
      model_id: params.model.model_id,
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
      metadata: {},
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
