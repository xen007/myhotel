import { deliverPdf } from '@/lib/pdf';

function htmlToLines(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|li|header|footer|article|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function emitDocument(filename: string, title: string, html: string, mode: 'download' | 'print') {
  const lines = htmlToLines(html);
  void deliverPdf(filename, title, lines.length ? lines : [title], mode);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}

function wrapHtml(title: string, inner: string) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #141622; padding: 36px; max-width: 720px; margin: 0 auto; }
    .brand { color: #D4AF37; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; font-size: 12px; }
    h1 { margin: 8px 0 20px; font-size: 26px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #ececec; font-size: 14px; }
    .gold { color: #D4AF37; font-weight: 800; }
    .muted { color: #666; font-size: 12px; }
    .total { font-size: 18px; font-weight: 800; margin-top: 16px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <div class="brand">MyHotel</div>
  <h1>${title}</h1>
  ${inner}
  <p class="muted">Document généré le ${new Date().toLocaleString('fr-FR')} — Montants en FCFA (XAF)</p>
</body>
</html>`;
}

export function printHtml(title: string, inner: string) {
  emitDocument(`${title}.pdf`, title, wrapHtml(title, inner), 'print');
}

export function downloadReport(filename: string, title: string, inner: string) {
  emitDocument(filename, title, wrapHtml(title, inner), 'download');
}

export function printGuestBadges(
  badges: {
    guest_name: string;
    room_number: string;
    valid_from: string;
    valid_to: string;
    check_in_time?: string;
    check_out_time?: string;
    code: string;
  }[],
) {
  const cards = badges
    .map((badge) => {
      const pan = `•••• •••• •••• ${String(badge.room_number).padStart(4, '0')}`;
      const from = escapeHtml(badge.valid_from.slice(0, 10));
      const to = escapeHtml(badge.valid_to.slice(0, 10));
      const hours = [badge.check_in_time, badge.check_out_time].filter(Boolean).map((item) => escapeHtml(String(item))).join(' → ');
      return `<article class="card">
        <div class="shine"></div>
        <div class="row">
          <div class="brand">MyHotel</div>
          <div class="chip"></div>
        </div>
        <div class="pan">${pan}</div>
        <div class="row bottom">
          <div>
            <div class="label">Titulaire</div>
            <div class="name">${escapeHtml(badge.guest_name.toUpperCase())}</div>
          </div>
          <div>
            <div class="label">Valide</div>
            <div class="valid">${from} → ${to}</div>
            ${hours ? `<div class="hours">${hours}</div>` : ''}
          </div>
        </div>
        <div class="code">${escapeHtml(badge.code)}</div>
      </article>`;
    })
    .join('');

  emitDocument('badges-acces.pdf', 'Badges d’accès chambre', cards, 'print');
}

export function printReceipt(opts: {
  title: string;
  rows: [string, string][];
  total?: string;
  actor?: string;
}) {
  const rows = opts.rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
  printHtml(
    opts.title,
    `<table>${rows}</table>
     ${opts.total ? `<p class="total">${opts.total}</p>` : ''}
     ${opts.actor ? `<p class="muted">Opérateur : ${opts.actor}</p>` : ''}`,
  );
}

export type ReservationVoucher = {
  id: number;
  guest_name: string;
  guest_phone?: string | null;
  document_id?: string | null;
  room_number: string;
  room_type: string;
  check_in: string;
  check_out: string;
  check_in_time?: string;
  check_out_time?: string;
  status: string;
  total: number;
  occupants?: { first_name: string; last_name: string; phone?: string; document_id?: string }[];
};

export type CompanyVoucher = {
  name?: string | null;
  legal_name?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  nif?: string | null;
  rccm?: string | null;
  slogan?: string | null;
  logo?: string | null;
  stamp?: string | null;
};

function voucherHtml(stay: ReservationVoucher, company: CompanyVoucher = {}, statusLabel = stay.status) {
  const name = escapeHtml(company.name || 'MyHotel');
  const legal = escapeHtml(company.legal_name || name);
  const line = [company.address, company.city, company.country].filter(Boolean).map((item) => escapeHtml(String(item))).join(' · ');
  const contacts = [company.phone, company.email, company.website].filter(Boolean).map((item) => escapeHtml(String(item))).join('  ·  ');
  const ids = [company.nif ? `NIF ${escapeHtml(company.nif)}` : '', company.rccm ? `RCCM ${escapeHtml(company.rccm)}` : '']
    .filter(Boolean)
    .join('  ·  ');
  const people = (stay.occupants?.length
    ? stay.occupants
    : [{ first_name: stay.guest_name, last_name: '', phone: stay.guest_phone || '', document_id: stay.document_id || '' }]
  )
    .map(
      (person, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(`${person.first_name} ${person.last_name}`.trim())}</td>
        <td>${escapeHtml(person.phone || '—')}</td>
        <td>${escapeHtml(person.document_id || '—')}</td>
      </tr>`,
    )
    .join('');
  const total = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(stay.total || 0);
  const logo = company.logo
    ? `<img class="logo" src="${company.logo}" alt="Logo" />`
    : `<div class="logo-mark">${name.slice(0, 2).toUpperCase()}</div>`;
  const stamp = company.stamp ? `<img class="stamp" src="${company.stamp}" alt="Cachet" />` : '';

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Confirmation ${escapeHtml(String(stay.id))} — ${name}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #efe7d2; font-family: 'Palatino Linotype', Palatino, 'Times New Roman', serif; color: #141622; }
    .sheet {
      width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff;
      position: relative; overflow: hidden;
      border: 14px solid #141622;
    }
    .sheet:before {
      content: ''; position: absolute; inset: 10px; border: 1px solid #D4AF37; pointer-events: none;
    }
    .goldbar { height: 8px; background: linear-gradient(90deg, #8c7018, #D4AF37, #f4e3a1, #D4AF37, #8c7018); }
    header { display: flex; justify-content: space-between; align-items: center; padding: 22px 36px 12px; }
    .brand { display: flex; gap: 14px; align-items: center; }
    .logo, .logo-mark { width: 64px; height: 64px; object-fit: contain; border-radius: 12px; }
    .logo-mark { background: #D4AF37; color: #141622; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 22px; }
    .hotel { font-size: 28px; font-weight: 800; letter-spacing: .8px; margin: 0; }
    .legal { color: #8c7018; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; }
    .coords { text-align: right; font-size: 11px; line-height: 1.55; color: #3a3d4d; max-width: 260px; }
    .ribbon {
      margin: 8px 36px 0; background: #141622; color: #D4AF37; text-align: center;
      padding: 10px 16px; letter-spacing: 3px; font-weight: 800; font-size: 13px; text-transform: uppercase;
    }
    .kicker { text-align: center; margin: 16px 36px 0; color: #8c7018; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
    h1 { text-align: center; margin: 4px 36px 18px; font-size: 26px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 28px; padding: 0 36px; }
    .cell { border-bottom: 1px solid rgba(212,175,55,.45); padding: 8px 0; }
    .label { font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; color: #8c7018; font-weight: 800; }
    .value { font-size: 15px; font-weight: 700; margin-top: 3px; }
    table { width: calc(100% - 72px); margin: 18px 36px 0; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #8c7018; border-bottom: 2px solid #D4AF37; padding: 6px 8px; }
    td { padding: 8px; border-bottom: 1px solid #eee; font-size: 13px; }
    .total {
      margin: 22px 36px 0 auto; width: 260px; background: #141622; color: #D4AF37;
      padding: 14px 18px; text-align: right;
    }
    .total span { display: block; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; }
    .total strong { font-size: 22px; }
    .stamp-wrap { position: absolute; right: 42px; bottom: 88px; width: 128px; height: 128px; }
    .stamp { width: 128px; height: 128px; object-fit: contain; transform: rotate(-12deg); opacity: .92; }
    footer {
      position: absolute; left: 0; right: 0; bottom: 0; background: #141622; color: #D4AF37;
      padding: 12px 36px; font-size: 10px; letter-spacing: .4px; display: flex; justify-content: space-between;
    }
    .ref { position: absolute; top: 118px; right: 40px; font-size: 11px; color: #8c7018; font-weight: 800; }
    @media print { body { background: #fff; } .sheet { border-width: 10px; } }
  </style>
</head>
<body>
  <article class="sheet">
    <div class="goldbar"></div>
    <header>
      <div class="brand">
        ${logo}
        <div>
          <p class="legal">${legal}</p>
          <h2 class="hotel">${name}</h2>
          <div style="font-size:12px;opacity:.7">${escapeHtml(company.slogan || 'L’élégance de votre séjour')}</div>
        </div>
      </div>
      <div class="coords">${line || ''}<br/>${contacts || ''}<br/>${ids || ''}</div>
    </header>
    <div class="ribbon">Document officiel · Confirmation de réservation</div>
    <div class="ref">N° MH-${String(stay.id).padStart(5, '0')}</div>
    <p class="kicker">Séjour &amp; identité</p>
    <h1>${escapeHtml(stay.guest_name)}</h1>
    <div class="grid">
      <div class="cell"><div class="label">Chambre</div><div class="value">${escapeHtml(stay.room_number)} · ${escapeHtml(stay.room_type)}</div></div>
      <div class="cell"><div class="label">Statut</div><div class="value">${escapeHtml(statusLabel)}</div></div>
      <div class="cell"><div class="label">Arrivée</div><div class="value">${escapeHtml(stay.check_in)}${stay.check_in_time ? ` · ${escapeHtml(String(stay.check_in_time).slice(0, 5))}` : ''}</div></div>
      <div class="cell"><div class="label">Départ</div><div class="value">${escapeHtml(stay.check_out)}${stay.check_out_time ? ` · ${escapeHtml(String(stay.check_out_time).slice(0, 5))}` : ''}</div></div>
      <div class="cell"><div class="label">Téléphone</div><div class="value">${escapeHtml(stay.guest_phone || '—')}</div></div>
      <div class="cell"><div class="label">Pièce d’identité</div><div class="value">${escapeHtml(stay.document_id || '—')}</div></div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Occupant</th><th>Téléphone</th><th>CNI</th></tr></thead>
      <tbody>${people}</tbody>
    </table>
    <div class="total"><span>Montant du séjour</span><strong>${total}</strong></div>
    <div class="stamp-wrap">${stamp}</div>
    <footer>
      <span>${name} — document généré le ${new Date().toLocaleString('fr-FR')}</span>
      <span>Montants en FCFA (XAF)</span>
    </footer>
  </article>
</body>
</html>`;
}

function openVoucher(stay: ReservationVoucher, company: CompanyVoucher, statusLabel: string, mode: 'print' | 'download') {
  emitDocument(
    `reservation-MH-${String(stay.id).padStart(5, '0')}.pdf`,
    `Réservation MH-${String(stay.id).padStart(5, '0')}`,
    voucherHtml(stay, company, statusLabel),
    mode,
  );
}

export function printReservationReport(stay: ReservationVoucher, company: CompanyVoucher = {}, statusLabel?: string) {
  openVoucher(stay, company, statusLabel || stay.status, 'print');
}

export function downloadReservationReport(stay: ReservationVoucher, company: CompanyVoucher = {}, statusLabel?: string) {
  openVoucher(stay, company, statusLabel || stay.status, 'download');
}

export type SaleInvoice = {
  id: number;
  seller?: string | null;
  guest_name?: string | null;
  room_number?: string | null;
  total: number;
  at: string;
  items: { product_name: string; qty: number; price: number }[];
};

function moneyXaf(value: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(value || 0);
}

function saleInvoiceHtml(sale: SaleInvoice, company: CompanyVoucher = {}) {
  const name = escapeHtml(company.name || 'MyHotel');
  const legal = escapeHtml(company.legal_name || name);
  const line = [company.address, company.city, company.country].filter(Boolean).map((item) => escapeHtml(String(item))).join(' · ');
  const contacts = [company.phone, company.email].filter(Boolean).map((item) => escapeHtml(String(item))).join('  ·  ');
  const logo = company.logo
    ? `<img class="logo" src="${company.logo}" alt="Logo" />`
    : `<div class="logo-mark">${name.slice(0, 2).toUpperCase()}</div>`;
  const stamp = company.stamp ? `<img class="stamp" src="${company.stamp}" alt="Cachet" />` : '';
  const rows = (sale.items || [])
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.product_name)}</td>
        <td style="text-align:right">${item.qty}</td>
        <td style="text-align:right">${moneyXaf(item.price)}</td>
        <td style="text-align:right">${moneyXaf(item.qty * item.price)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Facture ${escapeHtml(String(sale.id))} — ${name}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #efe7d2; font-family: 'Palatino Linotype', Palatino, 'Times New Roman', serif; color: #141622; }
    .sheet { width: 186mm; min-height: 270mm; margin: 0 auto; background: #fff; border: 10px solid #141622; position: relative; padding-bottom: 70px; }
    .goldbar { height: 8px; background: linear-gradient(90deg, #8c7018, #D4AF37, #f4e3a1, #D4AF37, #8c7018); }
    header { display: flex; justify-content: space-between; align-items: center; padding: 18px 28px 10px; }
    .brand { display: flex; gap: 12px; align-items: center; }
    .logo, .logo-mark { width: 56px; height: 56px; object-fit: contain; border-radius: 10px; }
    .logo-mark { background: #D4AF37; color: #141622; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; }
    .hotel { font-size: 24px; font-weight: 800; margin: 0; }
    .legal { color: #8c7018; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .coords { text-align: right; font-size: 11px; line-height: 1.5; color: #3a3d4d; }
    .ribbon { margin: 8px 28px 0; background: #141622; color: #D4AF37; text-align: center; padding: 10px; letter-spacing: 2px; font-weight: 800; font-size: 12px; text-transform: uppercase; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; padding: 16px 28px 0; }
    .label { font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: #8c7018; font-weight: 800; }
    .value { font-size: 14px; font-weight: 700; margin-top: 2px; }
    table { width: calc(100% - 56px); margin: 18px 28px 0; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #8c7018; border-bottom: 2px solid #D4AF37; padding: 6px 8px; }
    td { padding: 8px; border-bottom: 1px solid #eee; font-size: 13px; }
    .total { margin: 20px 28px 0 auto; width: 240px; background: #141622; color: #D4AF37; padding: 12px 16px; text-align: right; }
    .total span { display: block; font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; }
    .total strong { font-size: 20px; }
    .stamp-wrap { position: absolute; right: 32px; bottom: 64px; width: 110px; height: 110px; }
    .stamp { width: 110px; height: 110px; object-fit: contain; transform: rotate(-12deg); }
    footer { position: absolute; left: 0; right: 0; bottom: 0; background: #141622; color: #D4AF37; padding: 10px 28px; font-size: 10px; display: flex; justify-content: space-between; }
    @media print { body { background: #fff; } }
  </style>
</head>
<body>
  <article class="sheet">
    <div class="goldbar"></div>
    <header>
      <div class="brand">
        ${logo}
        <div>
          <p class="legal">${legal}</p>
          <h2 class="hotel">${name}</h2>
        </div>
      </div>
      <div class="coords">${line || ''}<br/>${contacts || ''}</div>
    </header>
    <div class="ribbon">Facture de vente · Réception</div>
    <div class="meta">
      <div><div class="label">N° facture</div><div class="value">FAC-${String(sale.id).padStart(5, '0')}</div></div>
      <div><div class="label">Date</div><div class="value">${escapeHtml(String(sale.at || ''))}</div></div>
      <div><div class="label">Client</div><div class="value">${escapeHtml(sale.guest_name || 'Comptant')}</div></div>
      <div><div class="label">Chambre</div><div class="value">${escapeHtml(sale.room_number || '—')}</div></div>
      <div><div class="label">Caissier</div><div class="value">${escapeHtml(sale.seller || 'Réception')}</div></div>
    </div>
    <table>
      <thead><tr><th>Article</th><th style="text-align:right">Qté</th><th style="text-align:right">P.U.</th><th style="text-align:right">Montant</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">Aucun article</td></tr>'}</tbody>
    </table>
    <div class="total"><span>Total à payer</span><strong>${moneyXaf(sale.total)}</strong></div>
    <div class="stamp-wrap">${stamp}</div>
    <footer>
      <span>${name} — imprimez puis enregistrez en PDF</span>
      <span>Montants en FCFA (XAF)</span>
    </footer>
  </article>
</body>
</html>`;
}

function openSaleInvoice(sale: SaleInvoice, company: CompanyVoucher, mode: 'print' | 'download') {
  emitDocument(
    `facture-FAC-${String(sale.id).padStart(5, '0')}.pdf`,
    `Facture FAC-${String(sale.id).padStart(5, '0')}`,
    saleInvoiceHtml(sale, company),
    mode,
  );
}

export function printSaleInvoice(sale: SaleInvoice, company: CompanyVoucher = {}) {
  openSaleInvoice(sale, company, 'print');
}

export function downloadSaleInvoice(sale: SaleInvoice, company: CompanyVoucher = {}) {
  openSaleInvoice(sale, company, 'download');
}

export type PmsReportDoc = {
  title: string;
  subtitle?: string;
  kpis?: { label: string; value: string }[];
  columns: string[];
  rows: (string | number)[][];
  note?: string;
};

function pmsReportHtml(doc: PmsReportDoc, company: CompanyVoucher = {}) {
  const name = escapeHtml(company.name || 'MyHotel');
  const legal = escapeHtml(company.legal_name || name);
  const line = [company.address, company.city, company.country].filter(Boolean).map((item) => escapeHtml(String(item))).join(' · ');
  const contacts = [company.phone, company.email].filter(Boolean).map((item) => escapeHtml(String(item))).join('  ·  ');
  const logo = company.logo
    ? `<img class="logo" src="${company.logo}" alt="Logo" />`
    : `<div class="logo-mark">${name.slice(0, 2).toUpperCase()}</div>`;
  const kpis = (doc.kpis || [])
    .map((item) => `<div class="kpi"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`)
    .join('');
  const head = doc.columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
  const body = doc.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? '—'))}</td>`).join('')}</tr>`)
    .join('');
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(doc.title)} — ${name}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #efe7d2; font-family: 'Palatino Linotype', Palatino, 'Times New Roman', serif; color: #141622; }
    .sheet { width: 277mm; min-height: 180mm; margin: 0 auto; background: #fff; border: 10px solid #141622; }
    .goldbar { height: 8px; background: linear-gradient(90deg, #8c7018, #D4AF37, #f4e3a1, #D4AF37, #8c7018); }
    header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px 8px; }
    .brand { display: flex; gap: 12px; align-items: center; }
    .logo, .logo-mark { width: 52px; height: 52px; object-fit: contain; border-radius: 10px; }
    .logo-mark { background: #D4AF37; color: #141622; display: flex; align-items: center; justify-content: center; font-weight: 800; }
    .hotel { font-size: 22px; font-weight: 800; margin: 0; }
    .legal { color: #8c7018; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .coords { text-align: right; font-size: 11px; line-height: 1.5; color: #3a3d4d; }
    .ribbon { margin: 6px 24px 0; background: #141622; color: #D4AF37; text-align: center; padding: 8px; letter-spacing: 2px; font-weight: 800; font-size: 12px; text-transform: uppercase; }
    .kpis { display: flex; flex-wrap: wrap; gap: 10px; padding: 14px 24px 0; }
    .kpi { flex: 1; min-width: 140px; border: 1px solid #D4AF37; border-bottom: 3px solid #141622; border-radius: 10px; padding: 8px 10px; }
    .kpi span { display: block; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #8c7018; font-weight: 800; }
    .kpi strong { font-size: 16px; }
    table { width: calc(100% - 48px); margin: 14px 24px 18px; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #8c7018; border-bottom: 2px solid #D4AF37; padding: 6px 8px; }
    td { padding: 7px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
    tr:nth-child(even) td { background: rgba(212,175,55,.08); }
    .note { padding: 0 24px 18px; font-size: 11px; color: #666; }
    footer { background: #141622; color: #D4AF37; padding: 10px 24px; font-size: 10px; display: flex; justify-content: space-between; }
    @media print { body { background: #fff; } }
  </style>
</head>
<body>
  <article class="sheet">
    <div class="goldbar"></div>
    <header>
      <div class="brand">${logo}<div><p class="legal">${legal}</p><h2 class="hotel">${name}</h2></div></div>
      <div class="coords">${line || ''}<br/>${contacts || ''}</div>
    </header>
    <div class="ribbon">${escapeHtml(doc.title)}</div>
    ${doc.subtitle ? `<p class="note" style="padding-top:10px">${escapeHtml(doc.subtitle)}</p>` : ''}
    ${kpis ? `<div class="kpis">${kpis}</div>` : ''}
    <table><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="8">Aucune ligne.</td></tr>'}</tbody></table>
    ${doc.note ? `<p class="note">${escapeHtml(doc.note)}</p>` : ''}
    <footer><span>MyHotel · Rapport de gestion</span><span>Édité le ${escapeHtml(new Date().toLocaleString('fr-FR'))}</span></footer>
  </article>
</body>
</html>`;
}

function openPmsReport(doc: PmsReportDoc, company: CompanyVoucher, mode: 'print' | 'download') {
  emitDocument(`${doc.title.replace(/\s+/g, '-').toLowerCase()}.pdf`, doc.title, pmsReportHtml(doc, company), mode);
}

export function printPmsReport(doc: PmsReportDoc, company: CompanyVoucher = {}) {
  openPmsReport(doc, company, 'print');
}

export function downloadPmsReport(doc: PmsReportDoc, company: CompanyVoucher = {}) {
  openPmsReport(doc, company, 'download');
}
