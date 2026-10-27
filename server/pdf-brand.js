const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const INK = rgb(0.08, 0.09, 0.13);
const GOLD = rgb(0.83, 0.69, 0.22);
const LINE = rgb(0.86, 0.86, 0.88);
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const BOTTOM = 56;

function inkText(value) {
  return String(value || '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[→⇒]/g, '->')
    .replace(/[←⇐]/g, '<-')
    .replace(/…/g, '...')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/\s+/g, ' ')
    .replace(/[^\u0000-\u00FF]/g, '')
    .trim();
}

function fit(text, font, size, max) {
  const value = inkText(text);
  if (!value) return '';
  if (font.widthOfTextAtSize(value, size) <= max) return value;
  let cut = value;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > max) cut = cut.slice(0, -1);
  return `${cut}...`;
}

function paintChrome(page, font, bold, info, title) {
  const hotel = inkText(info.name) || 'MyHotel';
  page.drawRectangle({ x: 0, y: PAGE_H - 3, width: PAGE_W, height: 3, color: GOLD });
  let y = PAGE_H - 32;
  const textX = info.logo ? MARGIN + 44 : MARGIN;
  if (info.logo) {
    page.drawImage(info.logo, { x: MARGIN, y: y - 22, width: 32, height: 32 });
  }
  page.drawText(fit(hotel, bold, 15, PAGE_W - textX - MARGIN), { x: textX, y, size: 15, font: bold, color: INK });
  page.drawRectangle({ x: textX, y: y - 5, width: 36, height: 1.2, color: GOLD });
  y -= 16;
  const sub = [info.address, info.contacts].filter(Boolean).join('   ');
  if (sub) {
    page.drawText(fit(sub, font, 8, PAGE_W - textX - MARGIN), { x: textX, y, size: 8, font, color: INK });
    y -= 14;
  }
  page.drawText(fit(title || 'MyHotel', bold, 12, PAGE_W - MARGIN * 2), { x: MARGIN, y: y - 2, size: 12, font: bold, color: INK });
  page.drawRectangle({ x: MARGIN, y: 28, width: PAGE_W - MARGIN * 2, height: 0.6, color: GOLD });
  const foot = info.ids || hotel;
  page.drawText(fit(foot, font, 8, 360), { x: MARGIN, y: 14, size: 8, font, color: INK });
  return y - 24;
}

function drawPager(page, font, pageNo, pageCount) {
  const pager = `${pageNo} / ${pageCount}`;
  page.drawText(pager, {
    x: PAGE_W - MARGIN - font.widthOfTextAtSize(pager, 8),
    y: 14,
    size: 8,
    font,
    color: INK,
  });
}

async function embedDataImage(doc, dataUrl) {
  if (!dataUrl || !String(dataUrl).startsWith('data:image')) return null;
  const comma = String(dataUrl).indexOf(',');
  if (comma < 0) return null;
  const meta = String(dataUrl).slice(5, comma).toLowerCase();
  const bytes = Buffer.from(String(dataUrl).slice(comma + 1).replace(/\s/g, ''), 'base64');
  try {
    if (meta.includes('png')) return await doc.embedPng(bytes);
    if (meta.includes('jpeg') || meta.includes('jpg')) return await doc.embedJpg(bytes);
    try {
      return await doc.embedPng(bytes);
    } catch {
      return await doc.embedJpg(bytes);
    }
  } catch {
    return null;
  }
}

function brandInfo(brand, logo) {
  const name = String((brand && brand.name) || 'MyHotel').trim();
  const address = [brand && brand.address, brand && brand.city, brand && brand.country].filter(Boolean).join('  ');
  const contacts = [brand && brand.phone, brand && brand.email].filter(Boolean).join('   ');
  const ids = [brand && brand.nif ? `NIF ${brand.nif}` : '', brand && brand.rccm ? `RCCM ${brand.rccm}` : '']
    .filter(Boolean)
    .join('   ');
  return { name, address, contacts, ids, logo };
}

async function buildBrandedPdf(title, lines, brand, tables) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedDataImage(doc, brand && brand.logo);
  const info = brandInfo(brand, logo);
  const pages = [];
  const openPage = () => {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    return { page, y: paintChrome(page, font, bold, info, title) };
  };
  let cursor = openPage();
  const need = (height) => {
    if (cursor.y - height < BOTTOM) cursor = openPage();
  };

  (Array.isArray(lines) ? lines : [])
    .map((line) => inkText(line))
    .filter(Boolean)
    .forEach((line) => {
      need(16);
      cursor.page.drawText(fit(line, font, 10, PAGE_W - MARGIN * 2), {
        x: MARGIN,
        y: cursor.y,
        size: 10,
        font,
        color: INK,
      });
      cursor.y -= 14;
    });

  (Array.isArray(tables) ? tables : []).forEach((table) => {
    const rowCount = Math.max(1, Array.isArray(table.rows) ? table.rows.length : 0);
    const block = 16 + 18 + rowCount * 16 + 12;
    if (cursor.y - Math.min(block, 80) < BOTTOM) cursor = openPage();
    let y = cursor.y;
    const labels = (table.columns || []).map((col) => inkText(col)).filter(Boolean);
    if (!labels.length) return;
    const weights = Array.isArray(table.widths) && table.widths.length === labels.length
      ? table.widths.map((value) => Math.max(0.6, Number(value) || 1))
      : labels.map(() => 1);
    const total = weights.reduce((sum, value) => sum + value, 0);
    const width = PAGE_W - MARGIN * 2;
    const cols = weights.map((value) => (width * value) / total);
    const rows = Array.isArray(table.rows) && table.rows.length ? table.rows : [['Aucune ligne']];

    cursor.page.drawText(fit(table.title || 'Tableau', bold, 11, width), {
      x: MARGIN,
      y,
      size: 11,
      font: bold,
      color: INK,
    });
    y -= 16;
    let x = MARGIN;
    labels.forEach((label, index) => {
      cursor.page.drawText(fit(label, bold, 8, cols[index] - 8), { x: x + 4, y, size: 8, font: bold, color: INK });
      x += cols[index];
    });
    cursor.page.drawRectangle({ x: MARGIN, y: y - 5, width, height: 1, color: GOLD });
    y -= 16;

    rows.forEach((row, rowIndex) => {
      if (y < BOTTOM) {
        cursor = openPage();
        y = cursor.y;
      }
      if (rowIndex > 0) {
        cursor.page.drawRectangle({ x: MARGIN, y: y + 12, width, height: 0.4, color: LINE });
      }
      const cells = Array.isArray(row) ? row : [row];
      x = MARGIN;
      labels.forEach((_, index) => {
        cursor.page.drawText(fit(cells[index] || '', font, 8, cols[index] - 8), {
          x: x + 4,
          y,
          size: 8,
          font,
          color: INK,
        });
        x += cols[index];
      });
      y -= 16;
    });
    cursor.y = y - 12;
  });

  if (!pages.length) openPage();
  pages.forEach((page, index) => drawPager(page, font, index + 1, pages.length));
  return doc.save();
}

module.exports = { buildBrandedPdf };
