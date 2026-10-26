import { Alert, Platform } from 'react-native';

const WIN: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '–': 0x96,
  '—': 0x97,
  ' ': 0xa0,
  '¡': 0xa1,
  '«': 0xab,
  '»': 0xbb,
  'À': 0xc0,
  'Â': 0xc2,
  'Ç': 0xc7,
  'È': 0xc8,
  'É': 0xc9,
  'Ê': 0xca,
  'Ë': 0xcb,
  'Î': 0xce,
  'Ï': 0xcf,
  'Ô': 0xd4,
  'Ù': 0xd9,
  'Û': 0xdb,
  'Ü': 0xdc,
  'à': 0xe0,
  'â': 0xe2,
  'ç': 0xe7,
  'è': 0xe8,
  'é': 0xe9,
  'ê': 0xea,
  'ë': 0xeb,
  'î': 0xee,
  'ï': 0xef,
  'ô': 0xf4,
  'ö': 0xf6,
  'ù': 0xf9,
  'û': 0xfb,
  'ü': 0xfc,
};

function pdfText(value: string) {
  let out = '';
  for (const ch of value) {
    if (ch === 'œ') {
      out += 'oe';
      continue;
    }
    if (ch === 'Œ') {
      out += 'OE';
      continue;
    }
    const code = ch.codePointAt(0) ?? 63;
    const byte = code < 128 ? code : WIN[ch];
    const safe = byte == null ? 63 : byte;
    if (safe === 0x28 || safe === 0x29 || safe === 0x5c) out += `\\${String.fromCharCode(safe)}`;
    else if (safe < 32 || safe > 126) out += `\\${safe.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(safe);
  }
  return out;
}

function wrapLine(line: string, width: number) {
  if (!line) return [''];
  const parts: string[] = [];
  let rest = line;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(' ', width);
    if (cut < 12) cut = width;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  parts.push(rest);
  return parts;
}

export function buildPdf(title: string, lines: string[]) {
  const wrapped = lines.flatMap((line) => wrapLine(line, 92));
  const perPage = 46;
  const pages: string[][] = [];
  for (let index = 0; index < Math.max(wrapped.length, 1); index += perPage) {
    pages.push(wrapped.slice(index, index + perPage));
  }

  const objects: string[] = [];
  const pageIds: number[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('');

  const fontId = 3 + pages.length * 2;
  pages.forEach((pageLines, pageIndex) => {
    const pageId = 3 + pageIndex * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const commands = [
      'BT',
      '/F1 16 Tf',
      '48 800 Td',
      `(${pdfText(title)}) Tj`,
      '/F1 10 Tf',
      '0 -28 Td',
    ];
    pageLines.forEach((line, lineIndex) => {
      if (lineIndex > 0) commands.push('0 -15 Td');
      commands.push(`(${pdfText(line)}) Tj`);
    });
    commands.push('ET');
    const stream = commands.join('\n');
    objects[1] = '';
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function deliverPdf(filename: string, title: string, lines: string[], mode: 'download' | 'print' = 'download') {
  const safeName = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename.replace(/\.(html?|pdf)$/i, '')}.pdf`;
  const bytes = buildPdf(title, lines);

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    if (mode === 'print') {
      const popup = window.open(url, '_blank', 'noopener,noreferrer');
      if (!popup) window.alert('Autorisez les pop-ups pour ouvrir le PDF.');
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = safeName;
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  try {
    const FileSystem = await import('expo-file-system/legacy');
    const Sharing = await import('expo-sharing');
    const base = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!base) throw new Error('Dossier temporaire indisponible.');
    const uri = `${base}${safeName.replace(/[^\w.-]+/g, '-')}`;
    await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
      return;
    }
  } catch {
    /* module natif absent : message ci-dessous */
  }

  Alert.alert('PDF', 'Ouvrez MyHotel dans le navigateur pour télécharger ce document PDF.');
}
