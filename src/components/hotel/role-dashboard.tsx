import { createElement, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AppIcon, type BoxIconName } from '@/components/box-icon';
import { Palette, Radius } from '@/constants/theme';
import { money } from '@/lib/format';

export type DashSeries = {
  date: string;
  label: string;
  occupied: number;
  arrivals: number;
  departures: number;
  claimed: number;
  ready: number;
};

export type DashPayload = {
  rooms: { total: number; available: number; occupied: number; cleaning: number; maintenance: number };
  reservations: { total: number; live: number; arrivals_today: number; departures_today: number; in_house: number };
  housekeeping: {
    urgente: number;
    non_prise: number;
    en_cours: number;
    pret_today: number;
    maintenance: number;
    issues_open: number;
  };
  agent: { today: number; total: number };
  billing: { paid: number; pending: number };
  pos_today: number;
  occupancy_pct: number;
  series: DashSeries[];
  suggestions?: { open: number; total: number };
  pos_count_today?: number;
};

type Slice = { label: string; value: number; color: string };

export function RoleDashboard({
  data,
  role,
}: {
  data: DashPayload;
  role?: string | null;
  name?: string | null;
}) {
  const hk = role === 'housekeeping';
  const rec = role === 'receptionist';
  const roomSlices: Slice[] = [
    { label: 'Occupées', value: data.rooms.occupied, color: Palette.ink },
    { label: 'Libres', value: data.rooms.available, color: Palette.gold },
    { label: 'Entretien', value: data.rooms.cleaning, color: '#8c7018' },
    { label: 'Maintenance', value: data.rooms.maintenance, color: '#c4c4c8' },
  ];
  const hkSlices: Slice[] = [
    { label: 'Urgences', value: data.housekeeping.urgente, color: Palette.gold },
    { label: 'Non prises', value: data.housekeeping.non_prise, color: Palette.ink },
    { label: 'En cours', value: data.housekeeping.en_cours, color: '#8c7018' },
    { label: 'Maintenance', value: data.housekeeping.maintenance, color: '#c4c4c8' },
  ];
  const occMax = Math.max(...data.series.map((row) => row.occupied), 1);
  const hkMax = Math.max(...data.series.map((row) => Math.max(row.claimed, row.ready)), 1);
  const recMax = Math.max(...data.series.map((row) => Math.max(row.arrivals, row.departures)), 1);

  return (
    <View style={styles.page}>
      {hk ? (
        <View style={styles.kpis}>
          <Kpi icon="error-circle" label="Urgences" value={String(data.housekeeping.urgente)} />
          <Kpi icon="time" label="Non prises" value={String(data.housekeeping.non_prise)} />
          <Kpi icon="droplet" label="En cours" value={String(data.housekeeping.en_cours)} />
          <Kpi icon="cog" label="Maintenance" value={String(data.housekeeping.maintenance)} />
        </View>
      ) : rec ? (
        <View style={styles.kpis}>
          <Kpi icon="calendar" label="Réservations" value={String(data.reservations.live)} hint={`${data.reservations.total} au total`} />
          <Kpi icon="receipt" label="Nb ventes" value={String(data.pos_count_today ?? 0)} hint="Aujourd’hui" />
          <Kpi icon="wallet" label="Total ventes" value={money(data.pos_today)} hint="Aujourd’hui" />
        </View>
      ) : (
        <View style={styles.kpis}>
          <Kpi icon="bed" label="Occupées" value={String(data.rooms.occupied)} hint={`${data.occupancy_pct} %`} />
          <Kpi icon="door-open" label="Libres" value={String(data.rooms.available)} />
          <Kpi icon="calendar" label="Arrivées" value={String(data.reservations.arrivals_today)} />
          <Kpi icon="log-out" label="Départs" value={String(data.reservations.departures_today)} />
        </View>
      )}

      {rec ? (
        <>
        <View style={styles.row}>
          <Card title="Réservations · 7 jours" hint="Arrivées et départs">
            <Bars
              items={data.series.map((row) => ({
                label: row.label,
                value: row.arrivals,
                alt: row.departures,
              }))}
              max={recMax}
            />
            <View style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: Palette.gold }]} />
              <Text style={styles.legendLabel}>Arrivées</Text>
              <View style={[styles.swatch, { backgroundColor: Palette.ink, marginLeft: 12 }]} />
              <Text style={styles.legendLabel}>Départs</Text>
            </View>
          </Card>
          <Card title="Ventes" hint="Aujourd’hui">
            <View style={styles.mini}>
              <Mini label="Nombre de ventes" value={String(data.pos_count_today ?? 0)} />
              <Mini label="Somme totale" value={money(data.pos_today)} />
            </View>
          </Card>
        </View>
        </>
      ) : (
      <View style={styles.row}>
        <Card title={hk ? 'Répartition des chambres' : 'Occupation'} hint={hk ? 'Statut' : `${data.occupancy_pct} % aujourd’hui`}>
          <View style={styles.donutRow}>
            <Donut slices={hk ? hkSlices : roomSlices} center={hk ? String(data.rooms.total) : `${data.occupancy_pct}%`} caption={hk ? 'chambres' : 'occupation'} />
            <View style={styles.legend}>
              {(hk ? hkSlices : roomSlices).map((slice) => (
                <View key={slice.label} style={styles.legendRow}>
                  <View style={[styles.swatch, { backgroundColor: slice.color }]} />
                  <Text style={styles.legendLabel}>{slice.label}</Text>
                  <Text style={styles.legendValue}>{slice.value}</Text>
                </View>
              ))}
            </View>
          </View>
        </Card>

        <Card title={hk ? 'Prises en charge · 7 jours' : 'Occupation · 7 jours'} hint="Courbe quotidienne">
          <Bars
            items={data.series.map((row) => ({
              label: row.label,
              value: hk ? row.claimed : row.occupied,
              alt: hk ? row.ready : row.arrivals,
            }))}
            max={hk ? hkMax : occMax}
          />
          <View style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: Palette.gold }]} />
            <Text style={styles.legendLabel}>{hk ? 'Prises en charge' : 'Occupées'}</Text>
            <View style={[styles.swatch, { backgroundColor: Palette.ink, marginLeft: 12 }]} />
            <Text style={styles.legendLabel}>{hk ? 'Prêtes' : 'Arrivées'}</Text>
          </View>
        </Card>
      </View>
      )}

      {rec ? null : <View style={styles.row}>
        {hk ? (
          <>
            <Card title="Vos statistiques" hint="Chambres prises en charge">
              <View style={styles.rings}>
                <Ring value={data.agent.today} label="Aujourd’hui" />
                <Ring value={data.agent.total} label="Total" />
              </View>
            </Card>
            <Card title="Signalements ouverts" hint="À transmettre à la gérance">
              <Text style={styles.big}>{data.housekeeping.issues_open}</Text>
              <Text style={styles.hint}>Prêtes aujourd’hui : {data.housekeeping.pret_today}</Text>
            </Card>
          </>
        ) : (
          <>
            <Card title="Activité réception" hint="En cours">
              <View style={styles.mini}>
                <Mini label="Séjours en cours" value={String(data.reservations.in_house)} />
                <Mini label="Nb ventes du jour" value={String(data.pos_count_today ?? 0)} />
                <Mini label="Somme des ventes" value={money(data.pos_today)} />
              </View>
            </Card>
            <Card title="Statut" hint="À surveiller">
              <View style={styles.mini}>
                <Mini label="Urgences" value={String(data.housekeeping.urgente)} />
                <Mini label="Non prises" value={String(data.housekeeping.non_prise)} />
                <Mini label="Signalements" value={String(data.housekeeping.issues_open)} />
                <Mini label="Maintenance" value={String(data.housekeeping.maintenance)} />
              </View>
            </Card>
            {role === 'manager' || role === 'owner' ? (
              <Card title="Encaissements" hint="Factures">
                <View style={styles.mini}>
                  <Mini label="Payé" value={money(data.billing.paid)} />
                  <Mini label="En attente" value={money(data.billing.pending)} />
                </View>
              </Card>
            ) : null}
          </>
        )}
      </View>}
    </View>
  );
}

function Kpi({ icon, label, value, hint }: { icon: BoxIconName; label: string; value: string; hint?: string }) {
  return (
    <View style={styles.kpi}>
      <View style={styles.kpiIcon}>
        <AppIcon name={icon} size={18} color={Palette.ink} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
    </View>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniItem}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

function Donut({ slices, center, caption }: { slices: Slice[]; center: string; caption: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  if (Platform.OS === 'web') {
    let acc = 0;
    const stops = slices
      .map((slice) => {
        const start = (acc / total) * 360;
        acc += slice.value;
        const end = (acc / total) * 360;
        return `${slice.color} ${start}deg ${end}deg`;
      })
      .join(', ');
    return (
      <View style={styles.donutWrap}>
        {createElement('div', {
          style: {
            width: 132,
            height: 132,
            borderRadius: 999,
            background: `conic-gradient(${stops})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        }, createElement('div', {
          style: {
            width: 84,
            height: 84,
            borderRadius: 999,
            background: Palette.white,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          },
        }, [
          createElement('span', { key: 'c', style: { color: Palette.ink, fontWeight: 800, fontSize: 18 } }, center),
          createElement('span', { key: 'l', style: { color: Palette.ink, opacity: 0.5, fontSize: 10, fontWeight: 700 } }, caption),
        ]))}
      </View>
    );
  }
  return (
    <View style={styles.donutWrap}>
      <View style={styles.ringFallback}>
        <Text style={styles.ringValue}>{center}</Text>
        <Text style={styles.ringCaption}>{caption}</Text>
      </View>
    </View>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.ringBox}>
      <View style={styles.ringCircle}>
        <Text style={styles.ringValue}>{value}</Text>
      </View>
      <Text style={styles.ringCaption}>{label}</Text>
    </View>
  );
}

function Bars({ items, max }: { items: { label: string; value: number; alt: number }[]; max: number }) {
  return (
    <View style={styles.bars}>
      {items.map((item) => (
        <View key={item.label} style={styles.barCol}>
          <View style={styles.barTrack}>
            <View style={[styles.barAlt, { height: `${Math.max((item.alt / max) * 100, item.alt ? 8 : 0)}%` }]} />
            <View style={[styles.barFill, { height: `${Math.max((item.value / max) * 100, item.value ? 10 : 0)}%` }]} />
          </View>
          <Text style={styles.barLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: Palette.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Palette.gold,
    borderBottomWidth: 4,
    borderBottomColor: Palette.ink,
    gap: 4,
  },
  kpiIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  kpiValue: { color: Palette.ink, fontWeight: '800', fontSize: 24 },
  kpiLabel: { color: Palette.ink, opacity: 0.6, fontWeight: '700', fontSize: 12 },
  kpiHint: { color: Palette.gold, fontWeight: '800', fontSize: 11 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    flexGrow: 1,
    flexBasis: 280,
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(20,22,34,0.08)',
  },
  cardTitle: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  hint: { color: Palette.ink, opacity: 0.5, fontSize: 12, marginTop: -6 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  donutWrap: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  legend: { flex: 1, minWidth: 140, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 99 },
  legendLabel: { flex: 1, color: Palette.ink, fontSize: 12, fontWeight: '700' },
  legendValue: { color: Palette.ink, fontWeight: '800' },
  rings: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },
  ringBox: { alignItems: 'center', gap: 8 },
  ringCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 8,
    borderColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.white,
  },
  ringFallback: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 10,
    borderColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: { color: Palette.ink, fontWeight: '800', fontSize: 22 },
  ringCaption: { color: Palette.ink, opacity: 0.5, fontSize: 11, fontWeight: '700' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 140, paddingTop: 8 },
  barCol: { flex: 1, alignItems: 'center', gap: 6, height: '100%' },
  barTrack: {
    flex: 1,
    width: '100%',
    maxWidth: 28,
    backgroundColor: 'rgba(20,22,34,0.06)',
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: { width: '100%', backgroundColor: Palette.gold, borderRadius: 10 },
  barAlt: { position: 'absolute', bottom: 0, left: 4, right: 4, backgroundColor: Palette.ink, borderRadius: 8, opacity: 0.85 },
  barLabel: { color: Palette.ink, opacity: 0.5, fontSize: 10, fontWeight: '700' },
  mini: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniItem: {
    flexGrow: 1,
    flexBasis: 120,
    backgroundColor: 'rgba(20,22,34,0.04)',
    borderRadius: 14,
    padding: 12,
  },
  miniValue: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  miniLabel: { color: Palette.ink, opacity: 0.55, fontSize: 11, marginTop: 4, fontWeight: '700' },
  big: { color: Palette.gold, fontWeight: '800', fontSize: 42 },
});
