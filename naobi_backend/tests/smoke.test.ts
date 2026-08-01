import { createHash } from 'crypto';
import { hashApiKey } from '../src/services/litellm-admin.service';
import { classifyEndpoint, isAllowlistedGatewayPath } from '../src/services/llm/endpoint-class';

describe('smoke — hashApiKey', () => {
  it('hashes deterministically with sha256 hex', () => {
    const raw = 'sk-test-virtual-key';
    const expected = createHash('sha256').update(raw).digest('hex');
    expect(hashApiKey(raw)).toBe(expected);
    expect(hashApiKey(raw)).toBe(hashApiKey(raw));
  });

  it('differs for different keys', () => {
    expect(hashApiKey('sk-a')).not.toBe(hashApiKey('sk-b'));
  });
});

describe('smoke — classifyEndpoint', () => {
  it('classifies chat completions', () => {
    expect(classifyEndpoint('POST', '/v1/chat/completions').class).toBe('chat');
  });

  it('classifies embeddings / images / audio', () => {
    expect(classifyEndpoint('POST', '/v1/embeddings').class).toBe('embeddings');
    expect(classifyEndpoint('POST', '/v1/images/generations').class).toBe('images');
    expect(classifyEndpoint('POST', '/v1/audio/speech').class).toBe('audio');
    expect(classifyEndpoint('POST', '/v1/audio/transcriptions').class).toBe('audio');
  });

  it('allowlists Phase A paths and rejects unknown', () => {
    expect(isAllowlistedGatewayPath('POST', '/v1/embeddings')).toBe(true);
    expect(isAllowlistedGatewayPath('POST', '/v1/messages')).toBe(true);
    expect(isAllowlistedGatewayPath('DELETE', '/v1/admin/secret')).toBe(false);
  });
});
