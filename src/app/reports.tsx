import { Redirect } from 'expo-router';
import { createElement, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { FilterSelect } from '@/components/hotel/filter-bar';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { Breakpoints, Palette } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { type CompanyProfile } from '@/lib/api';
import { money, prettyDate, prettyStamp } from '@/lib/format';
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

export default function ReportsScreen() {
  const { data, error, loading, user, ready } = usePms<Payload>('reports');
  const { width } = useWindowDimensions();
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
      error={error}
      right={
        <>
          <GoldBtn compact icon="printer" label="Imprimer" variant="ghost" onPress={() => printPmsReport(doc, company)} />
          <GoldBtn compact icon="download" label="Télécharger" onPress={() => downloadPmsReport(doc, company)} />
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
});
