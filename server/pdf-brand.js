const { degrees, PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const INK = rgb(0.078, 0.086, 0.133);
const GOLD = rgb(0.831, 0.686, 0.216);
const CREAM = rgb(0.973, 0.957, 0.925);
const WHITE = rgb(1, 1, 1);
const SOFT = rgb(0.93, 0.9, 0.82);

function decodeBase64(value) {
  return Buffer.from(String(value).replace(/\s/g, ''), 'base64');
}

async function embedDataImage(doc, dataUrl) {
  if (!dataUrl || !String(dataUrl).startsWith('data:image')) return null;
  const comma = String(dataUrl).indexOf(',');
  if (comma < 0) return null;
  const meta = String(dataUrl).slice(5, comma).toLowerCase();
  const bytes = decodeBase64(String(dataUrl).slice(comma + 1));
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

function inkText(value) {
  return String(value || '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/[^\u0000-\u00FF]/g, '');
}

function brandLines(brand) {
  const name = String((brand && brand.name) || 'MyHotel').trim();
  const legal = String((brand && brand.legal_name) || '').trim();
  const address = [brand && brand.address, brand && brand.city, brand && brand.country].filter(Boolean).join('  ·  ');
  const contacts = [brand && brand.phone, brand && brand.email, brand && brand.website].filter(Boolean).join('   ·   ');
  const ids = [brand && brand.nif ? `NIF ${brand.nif}` : '', brand && brand.rccm ? `RCCM ${brand.rccm}` : '']
    .filter(Boolean)
    .join('   ·   ');
  return { name, legal, address, contacts, ids, slogan: String((brand && brand.slogan) || '').trim() };
}

function wrap(text, font, size, max) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= max) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function isHeading(line) {
  if (line.length > 42 || line.includes('·') || line.includes('|')) return false;
  return /^[A-ZÀ-Ÿ0-9]/.test(line);
}

function paintPage(page, font, bold, opts) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: CREAM });
  page.drawRectangle({ x: 0, y: 0, width: 12, height, color: GOLD });
  page.drawRectangle({ x: 12, y: height - 148, width: width - 12, height: 148, color: INK });
  page.drawRectangle({ x: 12, y: height - 154, width: width - 12, height: 6, color: GOLD });

  const hotel = inkText(opts.info.name) || 'MyHotel';
  if (opts.logo) {
    page.drawRectangle({ x: 32, y: height - 124, width: 84, height: 84, color: WHITE });
    page.drawImage(opts.logo, { x: 38, y: height - 118, width: 72, height: 72 });
  } else {
    page.drawRectangle({ x: 32, y: height - 124, width: 84, height: 84, color: GOLD });
    const mark = hotel.slice(0, 2).toUpperCase();
    const size = 26;
    const markWidth = bold.widthOfTextAtSize(mark, size);
    page.drawText(mark, { x: 32 + (84 - markWidth) / 2, y: height - 90, size, font: bold, color: INK });
  }

  const nameSize = Math.min(22, hotel.length > 22 ? 16 : 22);
  page.drawText(hotel, { x: 132, y: height - 58, size: nameSize, font: bold, color: GOLD });
  if (opts.info.legal && opts.info.legal !== opts.info.name) {
    page.drawText(inkText(opts.info.legal).slice(0, 70), { x: 132, y: height - 76, size: 9, font, color: WHITE });
  }
  if (opts.info.slogan) {
    page.drawText(inkText(opts.info.slogan).slice(0, 70), { x: 132, y: height - 92, size: 9, font, color: GOLD });
  }
  if (opts.info.address) {
    page.drawText(inkText(opts.info.address).slice(0, 90), { x: 132, y: height - 110, size: 8, font, color: WHITE });
  }
  if (opts.info.contacts) {
    page.drawText(inkText(opts.info.contacts).slice(0, 96), { x: 132, y: height - 124, size: 8, font, color: WHITE });
  }

  page.drawRectangle({ x: 28, y: height - 196, width: width - 52, height: 30, color: GOLD });
  const title = inkText(opts.title.length > 72 ? `${opts.title.slice(0, 69)}...` : opts.title);
  page.drawText(title || 'MyHotel', { x: 40, y: height - 186, size: 12, font: bold, color: INK });

  page.drawRectangle({ x: 12, y: 0, width: width - 12, height: 36, color: INK });
  page.drawRectangle({ x: 12, y: 36, width: width - 12, height: 3, color: GOLD });
  const footerLeft = opts.info.ids || `${hotel}  ·  document officiel`;
  page.drawText(inkText(footerLeft).slice(0, 78), { x: 28, y: 14, size: 8, font, color: GOLD });
  const pager = `${opts.pageNo} / ${opts.pageCount}`;
  page.drawText(pager, { x: width - 28 - font.widthOfTextAtSize(pager, 8), y: 14, size: 8, font, color: WHITE });

  if (opts.showStamp) {
    const sealX = width - 92;
    const sealY = 112;
    page.drawEllipse({
      x: sealX,
      y: sealY,
      xScale: 52,
      yScale: 52,
      borderColor: GOLD,
      borderWidth: 2.2,
      color: WHITE,
    });
    page.drawEllipse({
      x: sealX,
      y: sealY,
      xScale: 44,
      yScale: 44,
      borderColor: INK,
      borderWidth: 0.8,
    });
    if (opts.stamp) {
      page.drawImage(opts.stamp, {
        x: sealX - 34,
        y: sealY - 34,
        width: 68,
        height: 68,
        rotate: degrees(-10),
        opacity: 0.95,
      });
    } else {
      const cachet = 'CACHET';
      const cachetWidth = bold.widthOfTextAtSize(cachet, 9);
      page.drawText(cachet, { x: sealX - cachetWidth / 2, y: sealY + 4, size: 9, font: bold, color: INK });
      const short = hotel.slice(0, 18);
      const shortWidth = font.widthOfTextAtSize(short, 7);
      page.drawText(short, { x: sealX - shortWidth / 2, y: sealY - 12, size: 7, font, color: GOLD });
    }
  }
}

async function buildBrandedPdf(title, lines, brand) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedDataImage(doc, brand && brand.logo);
  const stamp = await embedDataImage(doc, brand && brand.stamp);
  const info = brandLines(brand);
  const skip = new Set(
    [info.name, info.legal, info.slogan, info.address, info.contacts, info.ids, title, 'Logo', 'Cachet']
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const body = (Array.isArray(lines) ? lines : [])
    .map((line) => String(line).replace(/\s+/g, ' ').trim())
    .filter((line) => line && !skip.has(line.toLowerCase()));
  const source = body.length ? body : [title || 'MyHotel'];
  const width = 595.28;
  const height = 841.89;
  const max = width - 72;
  const top = height - 214;
  const bottom = 168;
  const blocks = [];
  source.forEach((line) => {
    const heading = isHeading(line);
    const size = heading ? 12 : 10;
    wrap(line, heading ? bold : font, size, max).forEach((text) => blocks.push({ text, size, heading }));
  });

  const pages = [];
  let cursor = top;
  let bucket = [];
  blocks.forEach((block) => {
    const gap = block.heading ? 18 : 14;
    if (cursor - gap < bottom && bucket.length) {
      pages.push(bucket);
      bucket = [];
      cursor = top;
    }
    bucket.push(block);
    cursor -= gap;
  });
  if (bucket.length || !pages.length) pages.push(bucket);

  pages.forEach((pageBlocks, index) => {
    const page = doc.addPage([width, height]);
    paintPage(page, font, bold, {
      title: title || 'MyHotel',
      info,
      logo,
      stamp,
      pageNo: index + 1,
      pageCount: pages.length,
      showStamp: index === pages.length - 1,
    });
    let y = top;
    pageBlocks.forEach((block, lineIndex) => {
      if (!block.heading && lineIndex % 2 === 1) {
        page.drawRectangle({ x: 28, y: y - 4, width: width - 56, height: 16, color: SOFT });
      }
      const text = inkText(block.text);
      if (!text) {
        y -= block.heading ? 18 : 14;
        return;
      }
      page.drawText(text, {
        x: 36,
        y,
        size: block.size,
        font: block.heading ? bold : font,
        color: block.heading ? GOLD : INK,
      });
      y -= block.heading ? 18 : 14;
    });
  });

  return doc.save();
}

module.exports = { buildBrandedPdf };
