import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FilterBar, FilterSelect } from '@/components/hotel/filter-bar';
import { GoldBtn } from '@/components/hotel/kit';
import { Palette, Radius } from '@/constants/theme';
import { money, prettyStamp } from '@/lib/format';

export type HistoryLine = { name: string; qty: number; price?: number };

export type HistorySale = {
  id: number;
  ref: string;
  at: string;
  seller: string;
  total: number;
  pay: string;
  status: string;
  guest?: string;
  room?: string;
  items: HistoryLine[];
};

export function SaleHistory({
  visible,
  rows,
  onClose,
}: {
  visible: boolean;
  rows: HistorySale[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('all');
  const [seller, setSeller] = useState('all');
  const [status, setStatus] = useState('all');
  const [picked, setPicked] = useState<HistorySale | null>(null);

  const sellers = useMemo(() => {
    const names = [...new Set(rows.map((row) => row.seller).filter(Boolean))];
    return [{ id: 'all', label: 'Tous les vendeurs' }, ...names.map((name) => ({ id: name, label: name }))];
  }, [rows]);

  const statuses = useMemo(() => {
    const names = [...new Set(rows.map((row) => row.status).filter(Boolean))];
    return [{ id: 'all', label: 'Tous les statuts' }, ...names.map((name) => ({ id: name, label: name }))];
  }, [rows]);

  const visibleRows = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const limit = new Date();
    if (period === '7') limit.setDate(limit.getDate() - 6);
    if (period === '30') limit.setDate(limit.getDate() - 29);
    const from = limit.toISOString().slice(0, 10);
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const day = String(row.at || '').slice(0, 10);
      if (period === 'today' && day !== today) return false;
      if ((period === '7' || period === '30') && day < from) return false;
      if (seller !== 'all' && row.seller !== seller) return false;
      if (status !== 'all' && row.status !== status) return false;
      if (!needle) return true;
      const hay = `${row.ref} ${row.guest ?? ''} ${row.room ?? ''} ${row.seller} ${row.pay} ${row.items.map((item) => `${item.name} ${item.qty}`).join(' ')}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, query, period, seller, status]);

  function close() {
    setPicked(null);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={styles.fill} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>{picked ? picked.ref : 'Historique des ventes'}</Text>
            <GoldBtn compact icon="x-circle" label="Fermer" variant="ghost" onPress={close} />
          </View>
          {picked ? (
            <ScrollView contentContainerStyle={styles.body}>
              <GoldBtn compact icon="chevron-right" label="Retour à la liste" variant="ghost" onPress={() => setPicked(null)} />
              <Text style={styles.meta}>{prettyStamp(picked.at)} · {picked.seller}</Text>
              <Text style={styles.meta}>{picked.guest || 'Comptant'}{picked.room ? ` · Ch. ${picked.room}` : ''}</Text>
              <Text style={styles.meta}>{picked.pay} · {picked.status}</Text>
              {picked.items.map((item, index) => (
                <View key={`${item.name}-${index}`} style={styles.line}>
                  <Text style={styles.lineName} numberOfLines={1}>{item.name} ×{item.qty}</Text>
                  <Text style={styles.linePrice}>{money(Number(item.price || 0) * Number(item.qty || 0))}</Text>
                </View>
              ))}
              <Text style={styles.total}>{money(picked.total)}</Text>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.body}>
              <FilterBar
                query={query}
                onQuery={setQuery}
                queryPlaceholder="N° de vente, client, produit..."
                status={status}
                onStatus={setStatus}
                statuses={statuses}
              />
              <View style={styles.filters}>
                <FilterSelect
                  value={period}
                  onChange={setPeriod}
                  options={[
                    { id: 'all', label: 'Toute la période' },
                    { id: 'today', label: 'Aujourd’hui' },
                    { id: '7', label: '7 jours' },
                    { id: '30', label: '30 jours' },
                  ]}
                />
                <FilterSelect value={seller} onChange={setSeller} options={sellers} />
              </View>
              {visibleRows.map((row) => (
                <Pressable key={row.id} onPress={() => setPicked(row)} style={styles.row}>
                  <View style={styles.rowTop}>
                    <Text style={styles.ref}>{row.ref}</Text>
                    <Text style={styles.amount}>{money(row.total)}</Text>
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    {prettyStamp(row.at)} · {row.pay} · {row.status} · {row.seller}
                  </Text>
                  <Text style={styles.items} numberOfLines={1}>
                    {(row.guest ? `${row.guest} · ` : '') + (row.items.map((item) => `${item.name} ×${item.qty}`).join(', ') || '—')}
                  </Text>
                </Pressable>
              ))}
              {!visibleRows.length ? <Text style={styles.empty}>Aucune vente dans ce filtre.</Text> : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
  fill: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,22,34,0.55)' },
  sheet: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '88%',
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Palette.gold,
    zIndex: 2,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, color: Palette.ink, fontWeight: '800', fontSize: 16 },
  body: { gap: 8, paddingBottom: 4 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: {
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.gold,
    backgroundColor: Palette.white,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ref: { color: Palette.ink, fontWeight: '800', fontSize: 13 },
  amount: { color: Palette.ink, fontWeight: '800', fontSize: 13 },
  meta: { color: Palette.ink, opacity: 0.7, fontSize: 12 },
  items: { color: Palette.ink, fontSize: 12 },
  empty: { color: Palette.ink, opacity: 0.65, fontSize: 13 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lineName: { flex: 1, color: Palette.ink, fontWeight: '700', fontSize: 13 },
  linePrice: { color: Palette.ink, fontWeight: '800', fontSize: 13 },
  total: { color: Palette.ink, fontWeight: '800', fontSize: 16, textAlign: 'right' },
});
