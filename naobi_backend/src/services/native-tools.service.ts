import { renderPdf } from './pdf.service';
import { filesService } from './files.service';
import { config } from '../config/server';

export interface NativeToolContext {
  organizationId: string;
  agentId: string;
  userId?: string | null;
}

export interface NativeToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: NativeToolContext) => Promise<string>;
}

function fileUrl(id: string): string {
  const base = (config.domain || '').replace(/\/$/, '');
  return `${base}/files/${id}`;
}

const generatePdfDocument: NativeToolDefinition = {
  name: 'generate_pdf_document',
  description:
    "Génère un document PDF téléchargeable à partir d'un titre et de sections de texte " +
    '(facture, devis, rapport, lettre…). Renvoie un lien de téléchargement à donner à ' +
    "l'utilisateur — ne réécris pas le contenu du document dans ta réponse, contente-toi " +
    'du lien.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Titre du document (ex: "Facture #2026-014").',
      },
      sections: {
        type: 'array',
        description: 'Sections du document, dans l’ordre d’apparition.',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string', description: 'Titre de section (optionnel).' },
            body: {
              type: 'string',
              description: 'Texte de la section (paragraphes séparés par des retours à la ligne).',
            },
          },
          required: ['body'],
        },
      },
    },
    required: ['title', 'sections'],
  },
  async execute(args, ctx) {
    const title = String(args?.title || 'Document').slice(0, 200);
    const sections = Array.isArray(args?.sections)
      ? (args.sections as Array<{ heading?: string; body?: string }>)
      : [];

    const buffer = await renderPdf({
      title,
      sections: sections.map((s) => ({ heading: s.heading, body: s.body || '' })),
    });

    const filename = `${title.replace(/[^a-z0-9]+/gi, '-').slice(0, 60) || 'document'}.pdf`;
    const file = await filesService.store({
      organizationId: ctx.organizationId,
      agentId: ctx.agentId,
      createdBy: ctx.userId,
      filename,
      mimeType: 'application/pdf',
      content: buffer,
    });

    return `Document PDF généré : [${filename}](${fileUrl(file.id)})`;
  },
};

const NATIVE_TOOLS: NativeToolDefinition[] = [generatePdfDocument];

export const nativeToolsService = {
  list(): NativeToolDefinition[] {
    return NATIVE_TOOLS;
  },

  async call(
    name: string,
    args: Record<string, unknown>,
    ctx: NativeToolContext,
  ): Promise<string> {
    const tool = NATIVE_TOOLS.find((t) => t.name === name);
    if (!tool) {
      throw Object.assign(new Error(`Native tool "${name}" not found`), {
        code: 'NATIVE_TOOL_NOT_FOUND',
      });
    }
    return tool.execute(args, ctx);
  },
};
