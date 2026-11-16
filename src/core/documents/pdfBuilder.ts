/**
 * Zero-dependency compliant PDF 1.4 generator for compiled Ndakala HR Forms,
 * Handbooks, Address Proof Letters, and Certificates of Service.
 * Generates clean multi-page A4 documents readable by all PDF viewers & inline iframes.
 */

export interface PdfSectionInput {
  heading: string;
  body: string;
}

export interface BuildPdfOptions {
  title: string;
  subtitle?: string;
  organizationName?: string;
  referenceNumber?: string;
  generatedBy?: string;
  sections: PdfSectionInput[];
  footerNote?: string;
}

function escapePdfText(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars = 84): string[] {
  const result: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      result.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      if (!current) {
        current = word;
      } else if (`${current} ${word}`.length <= maxChars) {
        current = `${current} ${word}`;
      } else {
        result.push(current);
        current = word;
      }
    }
    if (current) result.push(current);
  }
  return result;
}

interface TextLineSpec {
  text: string;
  bold: boolean;
  size: number;
  spaceAfter: number;
  colorRgb?: [number, number, number];
}

export function buildStructuredPdf(options: BuildPdfOptions): Buffer {
  const orgName = options.organizationName || 'Ndakala Advisory LLP';
  const lines: TextLineSpec[] = [];

  lines.push({ text: orgName.toUpperCase(), bold: true, size: 10, spaceAfter: 4, colorRgb: [0.1, 0.25, 0.48] });
  lines.push({ text: options.title, bold: true, size: 16, spaceAfter: 6, colorRgb: [0.06, 0.09, 0.16] });
  if (options.subtitle) {
    lines.push({ text: options.subtitle, bold: false, size: 10.5, spaceAfter: 8, colorRgb: [0.28, 0.33, 0.41] });
  }
  const metaParts = [
    options.referenceNumber ? `Ref: ${options.referenceNumber}` : null,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    options.generatedBy ? `Prepared By: ${options.generatedBy}` : null,
  ].filter(Boolean);
  if (metaParts.length > 0) {
    lines.push({ text: metaParts.join('   |   '), bold: false, size: 9, spaceAfter: 12, colorRgb: [0.4, 0.45, 0.52] });
  }
  lines.push({ text: '--------------------------------------------------------------------------------------', bold: false, size: 9, spaceAfter: 10, colorRgb: [0.7, 0.74, 0.8] });

  for (const sec of options.sections) {
    lines.push({ text: sec.heading, bold: true, size: 11.5, spaceAfter: 4, colorRgb: [0.09, 0.22, 0.42] });
    const wrapped = wrapText(sec.body, 86);
    for (const w of wrapped) {
      lines.push({
        text: w || ' ',
        bold: false,
        size: 10,
        spaceAfter: w ? 4 : 6,
        colorRgb: [0.12, 0.16, 0.22],
      });
    }
    lines.push({ text: ' ', bold: false, size: 8, spaceAfter: 4 });
  }

  if (options.footerNote) {
    lines.push({ text: '--------------------------------------------------------------------------------------', bold: false, size: 9, spaceAfter: 8, colorRgb: [0.7, 0.74, 0.8] });
    for (const w of wrapText(options.footerNote, 90)) {
      lines.push({ text: w, bold: false, size: 8.5, spaceAfter: 3, colorRgb: [0.4, 0.45, 0.52] });
    }
  }

  // Paginate across A4 pages (595 x 842 pt)
  const pageHeight = 842;
  const topY = 788;
  const bottomY = 56;
  const leftX = 50;

  const pages: string[] = [];
  let streamLines: string[] = [];
  let cursorY = topY;

  const flushPage = () => {
    if (streamLines.length > 0) {
      pages.push(streamLines.join('\n'));
      streamLines = [];
    }
    cursorY = topY;
  };

  for (const item of lines) {
    const lineHeight = item.size + item.spaceAfter;
    if (cursorY - lineHeight < bottomY) {
      flushPage();
    }
    const fontKey = item.bold ? '/F2' : '/F1';
    const [r, g, b] = item.colorRgb || [0.1, 0.1, 0.1];
    streamLines.push(
      `BT ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg ${fontKey} ${item.size} Tf 1 0 0 1 ${leftX} ${cursorY.toFixed(1)} Tm (${escapePdfText(item.text)}) Tj ET`,
    );
    cursorY -= lineHeight;
  }
  flushPage();
  if (pages.length === 0) {
    pages.push(`BT 0 0 0 rg /F1 11 Tf 1 0 0 1 50 760 Tm (${escapePdfText(options.title)}) Tj ET`);
  }

  // Assemble PDF objects:
  // 1: Catalog, 2: Pages, 3: Font F1 (Helvetica), 4: Font F2 (Helvetica-Bold), then per-page [PageObj, ContentObj]
  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  const pageObjectIds: number[] = [];
  let nextObjId = 5;
  const pageObjects: string[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const pageObjId = nextObjId++;
    const contentObjId = nextObjId++;
    pageObjectIds.push(pageObjId);

    const contentStream = `${pages[i]}\n`;
    pageObjects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`,
    );
    pageObjects.push(
      `${contentObjId} 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}endstream\nendobj\n`,
    );
  }

  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>\nendobj\n`);
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');
  objects.push(...pageObjects);

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'latin1')];
  const offsets: number[] = [0];
  let byteLen = chunks[0].length;

  for (const objStr of objects) {
    offsets.push(byteLen);
    const buf = Buffer.from(objStr, 'utf8');
    chunks.push(buf);
    byteLen += buf.length;
  }

  const xrefOffset = byteLen;
  const xrefLines = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (let i = 1; i < offsets.length; i += 1) {
    xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xrefLines.join('') + trailer, 'utf8'));

  return Buffer.concat(chunks);
}
