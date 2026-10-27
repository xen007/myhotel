import { Redirect } from 'expo-router';
import { createElement, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { FilterBar, FilterSelect } from '@/components/hotel/filter-bar';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { Breakpoints, Palette, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { usePms } from '@/hooks/use-pms';
import { pmsGet, type CompanyProfile } from '@/lib/api';
import { money, prettyDate, prettyStamp } from '@/lib/format';
import { deliverPdf, type PdfTable } from '@/lib/pdf';
import { downloadPmsReport, printPmsReport, type PmsReportDoc } from '@/lib/print';

type Payload = {
  company?: CompanyProfile;
  kpis: {
    occupancy: number;
    adr: number;
    revpar: number;
    trevpar: number;
    goppar: number;
    roomRevenue: number;
    posRevenue: number;
    allRevenue: number;
    costs: number;
  };
  today: { date: string };
  rooms: { number: string; type: string; status: string; price_night: number }[];
  reservations: {
    guest_name: string;
    room_number: string;
    check_in: string;
    check_out: string;
    status: string;
    total: number;
  }[];
  sales: { id: number; seller?: string | null; guest_name?: string | null; total: number; at: string }[];
  products: { name: string; warehouse?: string | null; stock: number; min_stock: number; cost: number }[];
  moves?: { product_name: string; warehouse: string; type: string; qty: number; at: string; dest?: string | null; actor?: string | null }[];
  issues: { room_number: string; description: string; status: string; reporter: string; at: string }[];
  cash: { kind: string; label: string; amount: number; actor: string; at: string }[];
};

const KINDS = [
  { id: 'journal', label: 'Journalier' },
  { id: 'hebergement', label: 'Hébergement' },
  { id: 'ventes', label: 'Ventes' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'entretien', label: 'Statut' },
  { id: 'caisse', label: 'Caisse' },
  { id: 'clients', label: 'Clients' },
  { id: 'resultat', label: 'Résultat' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function inRange(value: string | undefined, from: string, to: string) {
  const day = String(value || '').slice(0, 10);
  if (!day) return false;
  return day >= from && day <= to;
}

function overlapsStay(checkIn: string, checkOut: string, from: string, to: string) {
  const inn = String(checkIn).slice(0, 10);
  const out = String(checkOut).slice(0, 10);
  return inn <= to && out >= from;
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.dateField}>
      <Text style={styles.datePrefix}>{label}</Text>
      {Platform.OS === 'web'
        ? createElement('input', {
            type: 'date',
            value,
            onChange: (event: { target: { value: string } }) => onChange(event.target.value),
            style: webDate,
          })
        : (
          <TextInput value={value} onChangeText={onChange} placeholder="AAAA-MM-JJ" style={styles.dateInput} />
        )}
    </View>
  );
}

function ManagerReports() {
  const { data, error, loading, user, ready } = usePms<Payload>('reports');
  const { width } = useWindowDimensions();
  const [reportError, setReportError] = useState<string | null>(null);
  const [kind, setKind] = useState('journal');
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIso);
  const canSee = user?.role === 'manager' || user?.role === 'owner';
  const isDesktop = width >= Breakpoints.desktop;
  const tableMin = 920;
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;

  const company = data?.company ?? {};

  const reservations = useMemo(
    () =>
      (data?.reservations ?? []).filter(
        (row) => row.status !== 'annulee' && overlapsStay(row.check_in, row.check_out, start, end),
      ),
    [data?.reservations, start, end],
  );
  const sales = useMemo(
    () => (data?.sales ?? []).filter((row) => inRange(row.at, start, end)),
    [data?.sales, start, end],
  );
  const cash = useMemo(
    () => (data?.cash ?? []).filter((row) => inRange(row.at, start, end)),
    [data?.cash, start, end],
  );
  const issues = useMemo(
    () => (data?.issues ?? []).filter((row) => inRange(row.at, start, end)),
    [data?.issues, start, end],
  );
  const moves = useMemo(
    () => (data?.moves ?? []).filter((row) => inRange(row.at, start, end)),
    [data?.moves, start, end],
  );

  const journalRows = useMemo(() => {
    const rows: { at: string; type: string; detail: string; extra: string }[] = [];
    for (const row of data?.reservations ?? []) {
      if (row.status === 'annulee') continue;
      const inn = String(row.check_in).slice(0, 10);
      const out = String(row.check_out).slice(0, 10);
      const stay = `${row.guest_name} · ch. ${row.room_number}`;
      if (inRange(inn, start, end)) {
        rows.push({ at: row.check_in, type: 'Arrivée', detail: stay, extra: money(row.total) });
      }
      if (inRange(out, start, end)) {
        rows.push({ at: row.check_out, type: 'Départ', detail: stay, extra: money(row.total) });
      }
      if (overlapsStay(inn, out, start, end) && !inRange(inn, start, end) && !inRange(out, start, end)) {
        rows.push({ at: start, type: 'Séjour', detail: stay, extra: money(row.total) });
      }
    }
    for (const row of sales) {
      rows.push({
        at: row.at,
        type: 'Vente',
        detail: `${row.guest_name || 'Comptant'} · ${row.seller || 'Réception'}`,
        extra: money(row.total),
      });
    }
    for (const row of cash) {
      rows.push({
        at: row.at,
        type: row.kind === 'entree' ? 'Caisse entrée' : 'Caisse sortie',
        detail: `${row.label} · ${row.actor || '—'}`,
        extra: money(row.amount),
      });
    }
    for (const row of issues) {
      rows.push({
        at: row.at,
        type: 'Signalement',
        detail: `Ch. ${row.room_number} · ${row.description}`,
        extra: row.status,
      });
    }
    for (const row of moves) {
      rows.push({
        at: row.at,
        type: `Stock ${row.type}`,
        detail: `${row.product_name} · ${row.warehouse}${row.dest ? ` → ${row.dest}` : ''}`,
        extra: String(row.qty),
      });
    }
    return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [data?.reservations, sales, cash, issues, moves, start, end]);

  const report = useMemo((): { columns: string[]; rows: (string | number)[][]; title: string } => {
    if (kind === 'hebergement') {
      return {
        title: 'Hébergement',
        columns: ['Client', 'Chambre', 'Arrivée', 'Départ', 'Statut', 'Total'],
        rows: reservations.map((row) => [
          row.guest_name,
          row.room_number,
          prettyDate(row.check_in),
          prettyDate(row.check_out),
          row.status,
          money(row.total),
        ]),
      };
    }
    if (kind === 'ventes') {
      return {
        title: 'Ventes',
        columns: ['N°', 'Vendeur', 'Client', 'Montant', 'Date'],
        rows: sales.map((row) => [
          `FAC-${String(row.id).padStart(5, '0')}`,
          row.seller || '—',
          row.guest_name || 'Comptant',
          money(row.total),
          prettyStamp(row.at),
        ]),
      };
    }
    if (kind === 'stocks') {
      return {
        title: 'Mouvements de stock',
        columns: ['Date', 'Produit', 'Magasin', 'Type', 'Qté', 'Acteur'],
        rows: moves.map((item) => [
          prettyStamp(item.at),
          item.product_name,
          item.warehouse,
          item.type,
          item.qty,
          item.actor || '—',
        ]),
      };
    }
    if (kind === 'entretien') {
      return {
        title: 'Statut',
        columns: ['Chambre', 'Détail', 'Statut', 'Agent', 'Date'],
        rows: issues.map((item) => [item.room_number, item.description, item.status, item.reporter, prettyStamp(item.at)]),
      };
    }
    if (kind === 'caisse') {
      return {
        title: 'Caisse',
        columns: ['Type', 'Libellé', 'Montant', 'Acteur', 'Date'],
        rows: cash.map((row) => [row.kind === 'entree' ? 'Entrée' : 'Sortie', row.label, money(row.amount), row.actor, prettyStamp(row.at)]),
      };
    }
    if (kind === 'clients') {
      return {
        title: 'Clients',
        columns: ['Client', 'Chambre', 'Arrivée', 'Départ', 'Statut', 'Total'],
        rows: reservations.map((row) => [
          row.guest_name,
          row.room_number,
          prettyDate(row.check_in),
          prettyDate(row.check_out),
          row.status,
          money(row.total),
        ]),
      };
    }
    if (kind === 'resultat') {
      const roomRev = reservations.reduce((sum, row) => sum + Number(row.total || 0), 0);
      const posRev = sales.reduce((sum, row) => sum + Number(row.total || 0), 0);
      const cashIn = cash.filter((row) => row.kind === 'entree').reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const cashOut = cash.filter((row) => row.kind === 'sortie').reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const ca = roomRev + posRev;
      return {
        title: 'Résultat de période',
        columns: ['Poste', 'Montant'],
        rows: [
          ['Hébergement', money(roomRev)],
          ['Ventes accueil', money(posRev)],
          ['Entrées de caisse', money(cashIn)],
          ['Sorties de caisse', money(cashOut)],
          ['Chiffre d’affaires', money(ca)],
          ['Résultat', money(ca + cashIn - cashOut)],
        ],
      };
    }
    return {
      title: 'Journal d’activité',
      columns: ['Date', 'Type', 'Détail', 'Montant / info'],
      rows: journalRows.map((row) => [prettyStamp(row.at), row.type, row.detail, row.extra]),
    };
  }, [kind, reservations, sales, issues, cash, moves, journalRows]);

  const doc: PmsReportDoc = {
    title: report.title,
    subtitle: `Du ${prettyDate(start)} au ${prettyDate(end)}`,
    columns: report.columns,
    rows: report.rows,
  };

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && !canSee) return <Redirect href="/home" />;

  return (
    <HotelShell
      title="Rapports"
      subtitle={`Du ${prettyDate(start)} au ${prettyDate(end)} · ${report.rows.length} ligne${report.rows.length > 1 ? 's' : ''}`}
      loading={loading && !data}
      error={error || reportError}
      right={
        <>
          <GoldBtn
            compact
            icon="printer"
            label="Imprimer"
            variant="ghost"
            onPress={() => {
              setReportError(null);
              void Promise.resolve(printPmsReport(doc, company)).catch((err) =>
                setReportError(err instanceof Error ? err.message : 'Impression impossible.'),
              );
            }}
          />
          <GoldBtn
            compact
            icon="download"
            label="Télécharger"
            onPress={() => {
              setReportError(null);
              void Promise.resolve(downloadPmsReport(doc, company)).catch((err) =>
                setReportError(err instanceof Error ? err.message : 'Téléchargement impossible.'),
              );
            }}
          />
        </>
      }>
      <View style={styles.toolbar}>
        <View style={styles.kindWrap}>
          <FilterSelect fill value={kind} onChange={setKind} options={KINDS} />
        </View>
        <DateField label="Du" value={from} onChange={setFrom} />
        <DateField label="Au" value={to} onChange={setTo} />
      </View>
      <View style={styles.board}>
        <View style={styles.boardHead}>
          <Text style={styles.boardTitle}>{report.title}</Text>
          <Text style={styles.boardMeta}>
            {prettyDate(start)} → {prettyDate(end)}
          </Text>
        </View>
        <ScrollView horizontal={!isDesktop} showsHorizontalScrollIndicator={!isDesktop}>
          <View style={[styles.table, { minWidth: isDesktop ? '100%' : tableMin, width: isDesktop ? '100%' : tableMin }]}>
            <View style={[styles.tr, styles.th]}>
              {report.columns.map((col) => (
                <Text key={col} style={[styles.td, styles.thText, { flex: 1 }]}>
                  {col}
                </Text>
              ))}
            </View>
            {report.rows.map((row, index) => (
              <View key={`${kind}-${index}`} style={[styles.tr, index % 2 ? styles.trAlt : null]}>
                {row.map((cell, cellIndex) => (
                  <Text key={`${index}-${cellIndex}`} style={[styles.td, styles.cell, { flex: 1 }]} numberOfLines={2}>
                    {String(cell)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        {!report.rows.length ? (
          <Text style={styles.empty}>Aucune ligne pour ces dates. Changez la période ou le type de rapport.</Text>
        ) : null}
      </View>
    </HotelShell>
  );
}

const webDate = {
  border: 'none',
  background: 'transparent',
  color: Palette.ink,
  flex: 1,
  minWidth: 118,
  fontSize: 14,
  outline: 'none',
  height: 38,
  fontWeight: 700,
} as const;

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Palette.white,
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  kindWrap: { flexGrow: 1, flexBasis: 200, minWidth: 180 },
  dateField: {
    flexGrow: 1,
    flexBasis: 168,
    minWidth: 158,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: Palette.white,
  },
  datePrefix: { color: Palette.ink, fontWeight: '800', fontSize: 12, opacity: 0.55, textTransform: 'uppercase' },
  dateInput: {
    flex: 1,
    minWidth: 0,
    color: Palette.ink,
    height: 38,
    fontWeight: '700',
  },
  board: {
    backgroundColor: Palette.white,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.gold,
  },
  boardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Palette.ink,
  },
  boardTitle: { color: Palette.gold, fontWeight: '800', fontSize: 16 },
  boardMeta: { color: Palette.white, opacity: 0.7, fontWeight: '700', fontSize: 12 },
  table: {
    overflow: 'hidden',
    backgroundColor: Palette.white,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(20,22,34,0.06)',
  },
  trAlt: { backgroundColor: 'rgba(212,175,55,0.08)' },
  th: { backgroundColor: 'rgba(212,175,55,0.18)' },
  thText: { color: Palette.ink, opacity: 0.55, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  td: { paddingRight: 8, minWidth: 80 },
  cell: { color: Palette.ink, fontSize: 13, fontWeight: '600' },
  empty: { color: Palette.ink, opacity: 0.6, padding: 16 },
  desk: { gap: 14, paddingBottom: 72 },
  deskRow: { flexDirection: 'row', gap: 8 },
  kpi: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
    borderRadius: 16,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 2,
    overflow: 'hidden',
  },
  kpiAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: Palette.gold },
  kpiTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  kpiDownload: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    borderBottomWidth: 3,
    borderBottomColor: '#8c7018',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  kpiLabel: { flex: 1, color: Palette.ink, opacity: 0.55, fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  kpiValue: { color: Palette.ink, fontWeight: '800', fontSize: 16, marginTop: 6 },
  kpiMeta: { color: Palette.ink, opacity: 0.62, fontSize: 11, fontWeight: '600' },
  deskPanel: {
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  deskFilter: { padding: 10 },
  deskNote: { color: Palette.ink, opacity: 0.62, fontSize: 12, paddingHorizontal: 14, paddingBottom: 4 },
  deskToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(20,22,34,0.06)',
  },
  deskField: { gap: 4, flexGrow: 1, flexBasis: 140 },
  deskFieldLabel: { color: Palette.ink, opacity: 0.5, fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  figures: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: 'rgba(212,175,55,0.1)' },
  figure: { width: '50%', paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  figureWide: { width: '25%' },
  figureFull: { width: '100%' },
  figureLabel: { color: Palette.ink, opacity: 0.55, fontSize: 10, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  figureValue: { color: Palette.ink, fontWeight: '800', fontSize: 15 },
  figureHint: { color: Palette.ink, opacity: 0.6, fontSize: 11 },
  sheet: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  sheetTitle: { color: Palette.ink, fontWeight: '800', fontSize: 15, flex: 1 },
  ledgerHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(212,175,55,0.45)' },
  ledgerHeadText: { color: Palette.ink, opacity: 0.5, fontSize: 10, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase', paddingRight: 8 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(20,22,34,0.08)' },
  ledgerCell: { color: Palette.ink, fontSize: 13, fontWeight: '600', paddingRight: 8 },
  alignRight: { textAlign: 'right', paddingRight: 0 },
  record: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(20,22,34,0.08)' },
  recordTitle: { color: Palette.ink, fontWeight: '700', fontSize: 14 },
  recordMeta: { color: Palette.ink, opacity: 0.58, fontSize: 12, marginTop: 2 },
  recordValue: { color: Palette.ink, fontWeight: '800', fontSize: 13, textAlign: 'right' },
  recordTag: { color: Palette.ink, opacity: 0.55, fontSize: 11, textAlign: 'right', marginTop: 2 },
  deskEmpty: { color: Palette.ink, opacity: 0.55, fontSize: 13, paddingVertical: 12 },
});

type DeskStay = {
  guest_name: string;
  room_number: string;
  room_type?: string;
  check_in: string;
  check_out: string;
  check_in_time?: string;
  check_out_time?: string;
  status: string;
  total: number;
};

type DeskSale = {
  id: number;
  guest_name?: string | null;
  room_number?: string | null;
  total: number;
  on_account?: number | null;
  settled_at?: string | null;
};

type DeskStock = { name: string; stock: number; min_stock: number; warehouse: string };

type DeskPayload = {
  date: string;
  stays: DeskStay[];
  sales: DeskSale[];
  stockout: DeskStock[];
  history?: DeskStay[];
  rooms?: string[];
};

const STAY_STATUS: Record<string, string> = {
  confirmee: 'Confirmée',
  en_cours: 'En cours',
  terminee: 'Terminée',
  annulee: 'Annulée',
};

type LedgerColumn = { key: string; label: string; flex: number; align?: 'right' };

function Ledger({ columns, rows, empty }: { columns: LedgerColumn[]; rows: Record<string, string | number>[]; empty: string }) {
  const { width } = useWindowDimensions();
  const wide = width >= Breakpoints.tablet;
  if (!rows.length) return <Text style={styles.deskEmpty}>{empty}</Text>;
  if (!wide) {
    return (
      <View>
        {rows.map((row, index) => {
          const keys = columns.map((column) => column.key);
          const meta = keys
            .slice(1, -1)
            .map((key) => row[key])
            .filter((value) => value && value !== '—')
            .join(' · ');
          return (
            <View key={`${row[keys[0]]}-${index}`} style={styles.record}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.recordTitle} numberOfLines={1}>{String(row[keys[0]] ?? '')}</Text>
                {meta ? <Text style={styles.recordMeta} numberOfLines={2}>{meta}</Text> : null}
              </View>
              <View>
                <Text style={styles.recordValue}>{String(row[keys[keys.length - 1]] ?? '')}</Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  }
  return (
    <View>
      <View style={styles.ledgerHead}>
        {columns.map((column) => (
          <Text key={column.key} style={[styles.ledgerHeadText, { flex: column.flex }, column.align === 'right' && styles.alignRight]}>
            {column.label}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View key={`${row[columns[0]?.key]}-${index}`} style={styles.ledgerRow}>
          {columns.map((column) => (
            <Text
              key={column.key}
              numberOfLines={1}
              style={[styles.ledgerCell, { flex: column.flex }, column.align === 'right' && styles.alignRight]}>
              {String(row[column.key] ?? '')}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function DeskReports() {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= Breakpoints.tablet;
  const [data, setData] = useState<DeskPayload | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState('all');
  const [room, setRoom] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);
    void Promise.all([
      pmsGet<DeskPayload>(token, 'reports/reception'),
      pmsGet<CompanyProfile>(token, 'company').catch(() => null),
    ])
      .then(([payload, brand]) => {
        if (!alive) return;
        setData(payload);
        setCompany(brand);
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Rapport indisponible.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function download(kind: 'sales' | 'stays' | 'stock') {
    if (!data || busy) return;
    setBusy(kind);
    setError(null);
    const date = data.date;
    try {
      if (kind === 'sales') {
        const rows = data.sales.length
          ? data.sales.map((row) => [
              `FAC-${String(row.id).padStart(5, '0')}`,
              row.guest_name || 'Comptant',
              row.room_number ? String(row.room_number) : 'Comptoir',
              row.room_number
                ? (Number(row.on_account) ? (row.settled_at ? 'Note réglée' : 'Sur la note') : 'Encaissé')
                : 'Comptoir',
              money(row.total),
            ])
          : [['—', 'Aucune vente', '—', '—', '—']];
        const table: PdfTable = {
          title: 'Ventes du jour',
          columns: ['Facture', 'Client', 'Chambre', 'Mode', 'Montant'],
          widths: [1.2, 2.1, 0.9, 1.3, 1.2],
          rows,
        };
        await deliverPdf(`ventes-${date}.pdf`, `Ventes du ${date}`, [`Journée : ${date}`], 'download', company ?? undefined, [table]);
      }
      if (kind === 'stays') {
        const rows = data.stays.length
          ? data.stays.map((row) => [
              row.guest_name,
              String(row.room_number),
              row.room_type || '—',
              String(row.check_in).slice(0, 10),
              String(row.check_out).slice(0, 10),
              STAY_STATUS[row.status] || row.status,
              money(row.total),
            ])
          : [['Aucune réservation', '—', '—', '—', '—', '—', '—']];
        const table: PdfTable = {
          title: 'Réservations du jour',
          columns: ['Client', 'Chambre', 'Type', 'Arrivée', 'Départ', 'Statut', 'Total'],
          widths: [2, 0.9, 1.2, 1.15, 1.15, 1.1, 1.2],
          rows,
        };
        await deliverPdf(`reservations-${date}.pdf`, `Réservations du ${date}`, [`Journée : ${date}`], 'download', company ?? undefined, [table]);
      }
      if (kind === 'stock') {
        const rows = data.stockout.length
          ? data.stockout.map((row) => [row.name, row.warehouse || '—', String(row.stock), String(row.min_stock ?? 0)])
          : [['Aucun produit en rupture', '—', '—', '—']];
        const table: PdfTable = {
          title: 'Produits en rupture de stock',
          columns: ['Produit', 'Magasin', 'Stock', 'Seuil'],
          widths: [2.4, 1.8, 1, 1],
          rows,
        };
        await deliverPdf(`rupture-${date}.pdf`, `Inventaire rupture — ${date}`, [`Journée : ${date}`], 'download', company ?? undefined, [table]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Téléchargement impossible.');
    } finally {
      setBusy(null);
    }
  }

  const date = data?.date || '';
  const sales = data?.sales ?? [];
  const stays = data?.stays ?? [];
  const history = data?.history ?? [];
  const salesSum = sales.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const staySum = stays.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const roomScoped = kind === 'all' || kind === 'roomsale' || kind === 'stays' || kind === 'occupants';
  const inRoom = (number?: string | null) => !roomScoped || room === 'all' || String(number || '') === room;
  const roomRows = room === 'all' ? [] : history.filter((row) => String(row.room_number) === room);
  const roomSum = roomRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const roomOptions = [
    { id: 'all', label: kind === 'occupants' ? 'Choisir' : 'Toutes' },
    ...(data?.rooms ?? []).map((number) => ({ id: number, label: `Chambre ${number}` })),
  ];
  const reportOptions = [
    { id: 'all', label: 'Journal' },
    { id: 'counter', label: 'Comptoir' },
    { id: 'roomsale', label: 'Sur chambre' },
    { id: 'stays', label: 'Réservations' },
    { id: 'occupants', label: 'Occupants' },
    { id: 'stock', label: 'Rupture' },
  ];

  async function downloadRoom() {
    if (!data || busy) return;
    setBusy('room');
    setError(null);
    try {
      const rows = roomRows.length
        ? roomRows.map((row) => [
            row.guest_name,
            String(row.check_in).slice(0, 10),
            (row.check_in_time || '').slice(0, 5) || '—',
            String(row.check_out).slice(0, 10),
            STAY_STATUS[row.status] || row.status,
            money(row.total),
          ])
        : [['Aucun occupant', '—', '—', '—', '—', '—']];
      const table: PdfTable = {
        title: `Occupants · chambre ${room}`,
        columns: ['Client', 'Arrivée', 'Heure', 'Départ', 'Statut', 'Total'],
        widths: [2.2, 1.2, 0.9, 1.2, 1.2, 1.2],
        rows,
      };
      await deliverPdf(`occupants-${room}.pdf`, `Occupants chambre ${room}`, [`${roomRows.length} séjour${roomRows.length > 1 ? 's' : ''} · ${money(roomSum)}`], 'download', company ?? undefined, [table]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Téléchargement impossible.');
    } finally {
      setBusy(null);
    }
  }

  const needle = query.trim().toLowerCase();
  const hit = (parts: (string | number | null | undefined)[]) => !needle || parts.join(' ').toLowerCase().includes(needle);
  const saleRow = (row: DeskSale) => ({
    bill: `FAC-${String(row.id).padStart(5, '0')}`,
    guest: row.guest_name || 'Comptant',
    room: row.room_number ? String(row.room_number) : 'Comptoir',
    mode: row.room_number
      ? (Number(row.on_account) ? (row.settled_at ? 'Note réglée' : 'Sur la note') : 'Encaissé')
      : 'Comptoir',
    total: money(row.total),
    amount: Number(row.total || 0),
  });
  const counterRows = sales
    .filter((row) => !row.room_number)
    .map(saleRow)
    .filter((row) => hit([row.bill, row.guest, row.mode, row.total]));
  const linkedRows = sales
    .filter((row) => row.room_number && inRoom(row.room_number))
    .map(saleRow)
    .filter((row) => hit([row.bill, row.guest, row.room, row.mode, row.total]));
  const stayRows = stays
    .filter((row) => inRoom(row.room_number))
    .map((row) => ({
      guest: row.guest_name,
      room: String(row.room_number),
      arrival: prettyDate(String(row.check_in).slice(0, 10)),
      departure: prettyDate(String(row.check_out).slice(0, 10)),
      status: STAY_STATUS[row.status] || row.status,
      total: money(row.total),
      amount: Number(row.total || 0),
    }))
    .filter((row) => hit([row.guest, row.room, row.arrival, row.departure, row.status, row.total]));
  const occupantRows = roomRows
    .map((row) => ({
      guest: row.guest_name,
      arrival: `${prettyDate(String(row.check_in).slice(0, 10))} ${(row.check_in_time || '').slice(0, 5)}`.trim(),
      departure: prettyDate(String(row.check_out).slice(0, 10)),
      status: STAY_STATUS[row.status] || row.status,
      total: money(row.total),
      amount: Number(row.total || 0),
    }))
    .filter((row) => hit([row.guest, row.arrival, row.departure, row.status, row.total]));
  const stockRows = (data?.stockout ?? [])
    .map((row) => ({
      name: row.name,
      warehouse: row.warehouse || '—',
      stock: String(row.stock),
      min: String(row.min_stock ?? 0),
    }))
    .filter((row) => hit([row.name, row.warehouse, row.stock]));
  const moneyOf = (rows: { amount: number }[]) => money(rows.reduce((sum, row) => sum + row.amount, 0));
  const showCounter = kind === 'all' || kind === 'counter';
  const showLinked = kind === 'all' || kind === 'roomsale';
  const showStays = kind === 'all' || kind === 'stays';
  const showStock = kind === 'all' || kind === 'stock';
  const showOccupants = kind === 'occupants';
  const figures = [
    ...(showCounter ? [{ label: 'Comptoir', value: moneyOf(counterRows), hint: `${counterRows.length} vente${counterRows.length > 1 ? 's' : ''}` }] : []),
    ...(showLinked ? [{ label: 'Sur chambre', value: moneyOf(linkedRows), hint: room === 'all' ? `${linkedRows.length} vente${linkedRows.length > 1 ? 's' : ''}` : `Chambre ${room}` }] : []),
    ...(showStays ? [{ label: 'Réservations', value: moneyOf(stayRows), hint: `${stayRows.length} séjour${stayRows.length > 1 ? 's' : ''}` }] : []),
    ...(showOccupants ? [{ label: 'Occupants', value: room === 'all' ? '—' : String(occupantRows.length), hint: room === 'all' ? 'Choisissez une chambre' : moneyOf(occupantRows) }] : []),
    ...(showStock ? [{ label: 'Rupture', value: String(stockRows.length), hint: 'Stock nul' }] : []),
  ];

  async function downloadSheet(id: string, filename: string, title: string, columns: string[], widths: number[], rows: string[][]) {
    if (!data || busy) return;
    setBusy(id);
    setError(null);
    try {
      const blank = columns.map((_, index) => (index === 0 ? 'Aucune ligne' : '—'));
      const table: PdfTable = { title, columns, widths, rows: rows.length ? rows : [blank] };
      await deliverPdf(filename, title, [`Journée : ${date}`], 'download', company ?? undefined, [table]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Téléchargement impossible.');
    } finally {
      setBusy(null);
    }
  }

  const roomLabel = room === 'all' ? '' : ` · chambre ${room}`;

  return (
    <HotelShell title="Rapport" subtitle={date ? `Journée du ${prettyDate(date)}` : 'Journée en cours'} loading={loading && !data} error={error}>
      <View style={styles.desk}>
        <View style={styles.deskRow}>
          <View style={styles.kpi}>
            <View style={styles.kpiAccent} />
            <View style={styles.kpiTop}>
              <Text style={styles.kpiLabel} numberOfLines={1}>Ventes</Text>
              <Pressable style={styles.kpiDownload} onPress={() => void download('sales')} accessibilityLabel="Télécharger les ventes">
                <AppIcon name="download" size={16} color={Palette.ink} />
              </Pressable>
            </View>
            <Text style={styles.kpiValue} numberOfLines={1}>{wide ? money(salesSum) : sales.length}</Text>
            <Text style={styles.kpiMeta} numberOfLines={2}>{wide ? `${sales.length} ticket${sales.length > 1 ? 's' : ''}` : money(salesSum)}</Text>
          </View>
          <View style={styles.kpi}>
            <View style={styles.kpiAccent} />
            <View style={styles.kpiTop}>
              <Text style={styles.kpiLabel} numberOfLines={1}>Séjours</Text>
              <Pressable style={styles.kpiDownload} onPress={() => void download('stays')} accessibilityLabel="Télécharger les réservations">
                <AppIcon name="download" size={16} color={Palette.ink} />
              </Pressable>
            </View>
            <Text style={styles.kpiValue} numberOfLines={1}>{wide ? money(staySum) : stays.length}</Text>
            <Text style={styles.kpiMeta} numberOfLines={2}>{wide ? `${stays.length} séjour${stays.length > 1 ? 's' : ''}` : money(staySum)}</Text>
          </View>
          <View style={styles.kpi}>
            <View style={styles.kpiAccent} />
            <View style={styles.kpiTop}>
              <Text style={styles.kpiLabel} numberOfLines={1}>Rupture</Text>
              <Pressable style={styles.kpiDownload} onPress={() => void download('stock')} accessibilityLabel="Télécharger la rupture">
                <AppIcon name="download" size={16} color={Palette.ink} />
              </Pressable>
            </View>
            <Text style={styles.kpiValue} numberOfLines={1}>{data?.stockout.length ?? 0}</Text>
            <Text style={styles.kpiMeta} numberOfLines={1}>stock nul</Text>
          </View>
        </View>

        <View style={styles.deskPanel}>
          <View style={styles.deskFilter}>
            <FilterBar
              query={query}
              onQuery={setQuery}
              queryPlaceholder={kind === 'stock' ? 'Rechercher un produit...' : 'Rechercher un client, une facture...'}
              category={kind}
              onCategory={setKind}
              categories={reportOptions}
              status={roomScoped ? room : undefined}
              onStatus={roomScoped ? setRoom : undefined}
              statuses={roomScoped ? roomOptions : undefined}
              stackSearch
            />
          </View>
          {roomScoped && room !== 'all' && kind !== 'occupants' ? (
            <Text style={styles.deskNote}>
              {kind === 'stays'
                ? `Réservations de la chambre ${room}.`
                : kind === 'roomsale'
                  ? `Ventes rattachées à la chambre ${room}.`
                  : `Chambre ${room} : ventes et réservations liées. Le comptoir reste complet.`}
            </Text>
          ) : null}
          {kind === 'counter' || kind === 'stock' ? (
            <Text style={styles.deskNote}>{kind === 'counter' ? 'Ventes encaissées sans chambre.' : 'Produits en rupture, indépendants des chambres.'}</Text>
          ) : null}

          <View style={styles.figures}>
            {figures.map((item) => (
              <View key={item.label} style={[styles.figure, figures.length === 1 && styles.figureFull, wide && figures.length > 2 && styles.figureWide]}>
                <Text style={styles.figureLabel}>{item.label}</Text>
                <Text style={styles.figureValue} numberOfLines={1}>{item.value}</Text>
                <Text style={styles.figureHint}>{item.hint}</Text>
              </View>
            ))}
          </View>

          {showCounter ? (
            <View style={styles.sheet}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Ventes comptoir</Text>
                <GoldBtn
                  compact
                  icon="download"
                  label={busy === 'counter' ? '…' : 'Télécharger'}
                  onPress={() => void downloadSheet(
                    'counter',
                    `comptoir-${date}.pdf`,
                    'Ventes comptoir',
                    ['Facture', 'Client', 'Mode', 'Montant'],
                    [1.3, 2.2, 1.3, 1.2],
                    counterRows.map((row) => [row.bill, row.guest, row.mode, row.total]),
                  )}
                />
              </View>
              <Ledger
                columns={[
                  { key: 'bill', label: 'Facture', flex: 1.3 },
                  { key: 'guest', label: 'Client', flex: 2 },
                  { key: 'mode', label: 'Mode', flex: 1.2 },
                  { key: 'total', label: 'Montant', flex: 1.2, align: 'right' },
                ]}
                rows={counterRows}
                empty="Aucune vente au comptoir."
              />
            </View>
          ) : null}
          {showLinked ? (
            <View style={styles.sheet}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{room === 'all' ? 'Ventes sur chambre' : `Ventes · chambre ${room}`}</Text>
                <GoldBtn
                  compact
                  icon="download"
                  label={busy === 'linked' ? '…' : 'Télécharger'}
                  onPress={() => void downloadSheet(
                    'linked',
                    `ventes-chambre-${room}-${date}.pdf`,
                    `Ventes sur chambre${roomLabel}`,
                    ['Facture', 'Client', 'Chambre', 'Mode', 'Montant'],
                    [1.2, 2, 0.9, 1.3, 1.2],
                    linkedRows.map((row) => [row.bill, row.guest, row.room, row.mode, row.total]),
                  )}
                />
              </View>
              <Ledger
                columns={[
                  { key: 'bill', label: 'Facture', flex: 1.2 },
                  { key: 'guest', label: 'Client', flex: 1.8 },
                  { key: 'room', label: 'Chambre', flex: 0.8 },
                  { key: 'mode', label: 'Mode', flex: 1.3 },
                  { key: 'total', label: 'Montant', flex: 1.2, align: 'right' },
                ]}
                rows={linkedRows}
                empty="Aucune vente rattachée à une chambre."
              />
            </View>
          ) : null}
          {showStays ? (
            <View style={styles.sheet}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{room === 'all' ? 'Réservations' : `Réservations · chambre ${room}`}</Text>
                <GoldBtn
                  compact
                  icon="download"
                  label={busy === 'stay-sheet' ? '…' : 'Télécharger'}
                  onPress={() => void downloadSheet(
                    'stay-sheet',
                    `reservations-${room}-${date}.pdf`,
                    `Réservations${roomLabel}`,
                    ['Client', 'Chambre', 'Arrivée', 'Départ', 'Statut', 'Total'],
                    [2, 0.9, 1.2, 1.2, 1.2, 1.2],
                    stayRows.map((row) => [row.guest, row.room, row.arrival, row.departure, row.status, row.total]),
                  )}
                />
              </View>
              <Ledger
                columns={[
                  { key: 'guest', label: 'Client', flex: 1.8 },
                  { key: 'room', label: 'Chambre', flex: 0.8 },
                  { key: 'arrival', label: 'Arrivée', flex: 1.2 },
                  { key: 'departure', label: 'Départ', flex: 1.2 },
                  { key: 'status', label: 'Statut', flex: 1.1 },
                  { key: 'total', label: 'Total', flex: 1.2, align: 'right' },
                ]}
                rows={stayRows}
                empty="Aucune réservation."
              />
            </View>
          ) : null}
          {showOccupants ? (
            <View style={styles.sheet}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{room === 'all' ? 'Occupants' : `Occupants · chambre ${room}`}</Text>
                {room !== 'all' ? (
                  <GoldBtn compact icon="download" label={busy === 'room' ? '…' : 'Télécharger'} onPress={() => void downloadRoom()} />
                ) : null}
              </View>
              {room === 'all' ? (
                <Text style={styles.deskEmpty}>Choisissez une chambre.</Text>
              ) : (
                <Ledger
                  columns={[
                    { key: 'guest', label: 'Client', flex: 2.1 },
                    { key: 'arrival', label: 'Arrivée', flex: 1.6 },
                    { key: 'departure', label: 'Départ', flex: 1.2 },
                    { key: 'status', label: 'Statut', flex: 1.1 },
                    { key: 'total', label: 'Total', flex: 1.2, align: 'right' },
                  ]}
                  rows={occupantRows}
                  empty="Aucun occupant pour cette chambre."
                />
              )}
            </View>
          ) : null}
          {showStock ? (
            <View style={styles.sheet}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Ruptures de stock</Text>
                <GoldBtn
                  compact
                  icon="download"
                  label={busy === 'stock-sheet' ? '…' : 'Télécharger'}
                  onPress={() => void downloadSheet(
                    'stock-sheet',
                    `rupture-${date}.pdf`,
                    'Ruptures de stock',
                    ['Produit', 'Magasin', 'Stock', 'Seuil'],
                    [2.4, 1.8, 1, 1],
                    stockRows.map((row) => [row.name, row.warehouse, row.stock, row.min]),
                  )}
                />
              </View>
              <Ledger
                columns={[
                  { key: 'name', label: 'Produit', flex: 2.2 },
                  { key: 'warehouse', label: 'Magasin', flex: 1.6 },
                  { key: 'stock', label: 'Stock', flex: 0.8, align: 'right' },
                  { key: 'min', label: 'Seuil', flex: 0.8, align: 'right' },
                ]}
                rows={stockRows}
                empty="Aucun produit en rupture."
              />
            </View>
          ) : null}
        </View>
      </View>
    </HotelShell>
  );
}

export default function ReportsScreen() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Redirect href="/welcome" />;
  if (user.role === 'receptionist') return <DeskReports />;
  return <ManagerReports />;
}
