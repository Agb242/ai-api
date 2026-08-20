import PDFDocument from 'pdfkit';

export interface PdfSection {
  heading?: string;
  body: string;
}

export interface PdfRequest {
  title: string;
  sections: PdfSection[];
}

/** Renders a simple structured document (title + text sections) to a PDF buffer. */
export function renderPdf(req: PdfRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text(req.title, { align: 'left' });
    doc.moveDown(1.5);

    for (const section of req.sections) {
      if (section.heading) {
        doc.fontSize(13).text(section.heading, { underline: true });
        doc.moveDown(0.5);
      }
      doc.fontSize(11).text(section.body || '', { align: 'left' });
      doc.moveDown(1);
    }

    doc.end();
  });
}
