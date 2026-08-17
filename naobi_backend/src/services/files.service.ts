import { GeneratedFile } from '../models/GeneratedFile';

export const filesService = {
  async store(params: {
    organizationId: string;
    agentId?: string | null;
    createdBy?: string | null;
    filename: string;
    mimeType: string;
    content: Buffer;
  }) {
    return GeneratedFile.query().insert({
      organization_id: params.organizationId,
      agent_id: params.agentId ?? null,
      created_by: params.createdBy ?? null,
      filename: params.filename,
      mime_type: params.mimeType,
      content: params.content,
      size_bytes: params.content.length,
    } as any);
  },

  async get(id: string) {
    return GeneratedFile.query().findById(id);
  },
};
