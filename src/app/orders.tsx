import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { HotelShell, StatusBadge } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { Breakpoints, Palette } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost } from '@/lib/api';
import { money, prettyStamp } from '@/lib/format';

type Line = { name: string; qty: number; price?: number };
type Order = {
  id: number;
  guest_name: string;
  guest_phone?: string | null;
  room_number?: string | null;
  table_number?: string | null;
  mode: string;
  pay: string;
  status: string;
  total: number;
  at: string;
  items?: Line[];
};

type Payload = { orders: Order[] };

const FILTERS = [
  { id: 'open', label: 'En cours' },
  { id: 'commandee', label: 'Reçues' },
  { id: 'preparation', label: 'Cuisine' },
  { id: 'servie', label: 'Servies' },
  { id: 'reglee', label: 'Réglées' },
];

const STATUS_LABEL: Record<string, string> = {
  commandee: 'Reçue',
  preparation: 'En cuisine',
  servie: 'Servie',
  reglee: 'Réglée',
};

export default function OrdersScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Payload>('restaurant');
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState('open');
  const allowed = user?.role === 'restaurant' || user?.role === 'manager' || user?.role === 'owner';
  const cols = width >= Breakpoints.desktop ? 3 : width >= Breakpoints.tablet ? 2 : 1;
  const orders = useMemo(() => {
    const rows = data?.orders ?? [];
    return rows.filter((row) => (filter === 'open' ? row.status !== 'reglee' : row.status === filter));
  }, [data?.orders, filter]);

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && !allowed) return <Redirect href="/home" />;

  async function advance(order: Order) {
    if (!token) return;
    const next = order.status === 'commandee' ? 'preparation' : order.status === 'preparation' ? 'servie' : 'reglee';
    await pmsPost(token, 'restaurant/order', { id: order.id, status: next });
    await reload();
  }

  return (
    <HotelShell title="Commandes" loading={loading && !data} error={error}>
      <View style={styles.filters}>
        {FILTERS.map((item) => (
          <Pressable key={item.id} onPress={() => setFilter(item.id)} style={[styles.filter, filter === item.id && styles.filterOn]}>
            <Text style={styles.filterText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.grid}>
        {orders.map((order) => {
          const lines = order.items ?? [];
          return (
            <View key={order.id} style={[styles.ticket, { width: cols === 1 ? '100%' : cols === 2 ? '48%' : '31.5%' }]}>
              <View style={styles.head}>
                <View style={styles.copy}>
                  <Text style={styles.name} numberOfLines={1}>{order.guest_name}</Text>
                  <Text style={styles.meta}>{order.room_number ? `Chambre ${order.room_number}` : 'Comptoir'} · {order.pay === 'note' ? 'Sur la note' : 'Espèces'}</Text>
                </View>
                <StatusBadge label={STATUS_LABEL[order.status] || order.status} tone={order.status === 'reglee' ? 'muted' : order.status === 'commandee' ? 'ink' : 'gold'} />
              </View>
              <Text style={styles.time}>{prettyStamp(order.at)}</Text>
              <View style={styles.lines}>
                {lines.map((line, index) => (
                  <View key={`${order.id}-${index}`} style={styles.line}>
                    <Text style={styles.lineName} numberOfLines={1}>{line.name}</Text>
                    <Text style={styles.lineQty}>×{line.qty}</Text>
                    <Text style={styles.linePrice}>{money(line.qty * Number(line.price || 0))}</Text>
                  </View>
                ))}
                {!lines.length ? <Text style={styles.meta}>Détail indisponible</Text> : null}
              </View>
              <View style={styles.foot}>
                <Text style={styles.total}>{money(order.total)}</Text>
                {order.status === 'reglee' ? null : (
                  <GoldBtn
                    compact
                    icon={order.status === 'servie' ? 'wallet' : 'restaurant'}
                    label={order.status === 'commandee' ? 'En cuisine' : order.status === 'preparation' ? 'Servir' : order.pay === 'especes' ? 'Encaisser' : 'Clôturer'}
                    onPress={() => void advance(order)}
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>
      {!orders.length ? <Text style={styles.empty}>Aucune commande dans cette liste.</Text> : null}
    </HotelShell>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(20,22,34,0.12)', backgroundColor: Palette.white, alignItems: 'center', justifyContent: 'center' },
  filterOn: { borderColor: Palette.gold, backgroundColor: 'rgba(212,175,55,0.35)' },
  filterText: { color: Palette.ink, fontWeight: '700', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  ticket: { gap: 6, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: Palette.gold, backgroundColor: Palette.white },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  name: { color: Palette.ink, fontWeight: '800', fontSize: 14 },
  meta: { color: Palette.ink, opacity: 0.65, fontSize: 12 },
  time: { color: Palette.ink, opacity: 0.65, fontSize: 12 },
  lines: { gap: 6, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(20,22,34,0.12)' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineName: { flex: 1, color: Palette.ink, fontSize: 14 },
  lineQty: { color: Palette.ink, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  linePrice: { color: Palette.ink, fontWeight: '700', minWidth: 88, textAlign: 'right' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4 },
  total: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  empty: { color: Palette.ink, opacity: 0.65 },
});
