/** A small PDF writer for text reports: the built-in Helvetica font and a right-hand column. */

export type PdfLine = {
  text: string;
  right?: string; // shown against the right margin
  size?: number;
  bold?: boolean;
  gap?: number; // extra space above
};

const PAPER = { a4: { width: 595, height: 842 }, letter: { width: 612, height: 792 } };
const MARGIN = 48;
const SIZE = 10.5;
const LEADING = 1.45;
const RIGHT_ROOM = 12; // between the text and the right-hand column

// Characters outside Latin-1 that the font's Windows encoding has
const WINDOWS: Record<string, number> = { '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85, '€': 0x80, '−': 0x2d };

/** The text in the font's encoding, one character per byte. */
function encode(text: string): string {
  return Array.from(text.replace(/\s+/g, ' '), (ch) => {
    const code = ch.codePointAt(0)!;
    if ((code >= 32 && code < 127) || (code >= 160 && code < 256)) return ch;
    return WINDOWS[ch] ? String.fromCharCode(WINDOWS[ch]) : '?';
  }).join('');
}

const escape = (text: string) => text.replace(/[\\()]/g, '\\$&');

/** Roughly how wide Helvetica draws this, in points. */
function width(text: string, size: number, bold?: boolean): number {
  let units = 0;
  for (const ch of text) {
    if (/[ .,:;'!|ijl]/.test(ch)) units += 0.26;
    else if (/[frt()\-/]/.test(ch)) units += 0.34;
    else if (/[mwMW@%]/.test(ch)) units += 0.95;
    else if (/[A-Z]/.test(ch)) units += 0.68;
    else units += 0.556;
  }
  return units * size * (bold ? 1.06 : 1);
}

function wrap(text: string, room: number, size: number, bold?: boolean): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    let next = line ? `${line} ${word}` : word;
    if (width(next, size, bold) <= room) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    next = word;
    while (width(next, size, bold) > room && next.length > 1) {
      let cut = next.length - 1;
      while (cut > 1 && width(next.slice(0, cut), size, bold) > room) cut--;
      lines.push(next.slice(0, cut));
      next = next.slice(cut);
    }
    line = next;
  }
  lines.push(line);
  return lines;
}

export function makePdf(lines: PdfLine[], paper: keyof typeof PAPER = 'a4'): string {
  const page = PAPER[paper];
  const pages: string[][] = [[]];
  let y = page.height - MARGIN;
  const full = page.width - 2 * MARGIN;
  const draw = (text: string, x: number, size: number, bold?: boolean) =>
    pages[pages.length - 1].push(`BT /F${bold ? 2 : 1} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${escape(text)}) Tj ET`);

  for (const line of lines) {
    const size = line.size ?? SIZE;
    const right = line.right ? encode(line.right) : '';
    const rightWidth = right ? width(right, size, line.bold) : 0;
    const parts = wrap(encode(line.text), full - (right ? rightWidth + RIGHT_ROOM : 0), size, line.bold);
    y -= line.gap ?? 0;
    parts.forEach((part, i) => {
      if (y - size * LEADING < MARGIN) {
        pages.push([]);
        y = page.height - MARGIN;
      }
      y -= size * LEADING;
      draw(part, MARGIN, size, line.bold);
      if (right && i === 0) draw(right, page.width - MARGIN - rightWidth, size, line.bold);
    });
  }

  // Objects: 1 catalog, 2 page list, 3 and 4 fonts, then a page and its contents for each page
  const font = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    font('Helvetica'),
    font('Helvetica-Bold'),
    ...pages.flatMap((content, i) => {
      const stream = content.join('\n');
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`,
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      ];
    }),
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

export const toBytes = (pdf: string) => Uint8Array.from(pdf, (c) => c.charCodeAt(0));
