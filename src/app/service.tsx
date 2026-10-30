import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { FilterBar } from '@/components/hotel/filter-bar';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { GoldBtn } from '@/components/hotel/kit';
import { SaleHistory, type HistorySale } from '@/components/hotel/sale-history';
import { Breakpoints, Palette, Radius } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost } from '@/lib/api';
import { money } from '@/lib/format';

type Dish = {
  id: number;
  name: string;
  category: string;
  price: number;
  photo?: string | null;
  stock?: number;
  available?: number;
};

type Payer = {
  id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  reservation_id?: number | null;
  room_number?: string | null;
  stay_status?: string | null;
};

type RestoOrder = {
  id: number;
  guest_name?: string | null;
  room_number?: string | null;
  table_number?: string | null;
  pay?: string | null;
  status?: string | null;
  total?: number;
  at?: string;
  seller?: string | null;
  user_email?: string | null;
  items?: { name: string; qty: number; price?: number }[];
};

type Occupant = {
  reservation_id: number;
  room_number: string;
  guest_name: string;
  guest_phone?: string | null;
  guest_email?: string | null;
};

type Payload = { items: Dish[]; payers?: Payer[]; occupants?: Occupant[]; orders?: RestoOrder[]; categories?: { id: number; name: string; kind: string; active?: number }[] };

const ORDER_STATUS: Record<string, string> = {
  commandee: 'Reçue',
  preparation: 'En cuisine',
  servie: 'Servie',
  reglee: 'Réglée',
};


export default function ServiceScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Payload>('restaurant');
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [onAccount, setOnAccount] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestRoom, setGuestRoom] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [stayId, setStayId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const allowed = user?.role === 'restaurant' || user?.role === 'manager' || user?.role === 'owner';
  const dishes = useMemo(() => (data?.items ?? []).filter((row) => Number(row.available ?? 1) === 1), [data?.items]);
  const payers = data?.payers ?? [];
  const occupants = data?.occupants ?? [];
  const occupant = useMemo(
    () => occupants.find((row) => String(row.room_number || '').trim() === guestRoom.trim()),
    [occupants, guestRoom],
  );
  const shownPayers = useMemo(() => {
    const needle = clientQuery.trim().toLowerCase();
    if (!needle) return payers;
    return payers.filter((row) => `${row.full_name} ${row.email} ${row.phone || ''} ${row.room_number || ''}`.toLowerCase().includes(needle));
  }, [payers, clientQuery]);
  const drinkCats = useMemo(
    () => new Set((data?.categories ?? []).filter((item) => item.kind === 'drink').map((item) => item.name.trim().toLowerCase())),
    [data?.categories],
  );
  const cols = width >= Breakpoints.desktop ? 3 : width >= Breakpoints.tablet ? 2 : 1;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dishes.filter((row) => {
      if (kind !== 'all' && row.category !== kind) return false;
      if (!needle) return true;
      return `${row.name} ${row.category}`.toLowerCase().includes(needle);
    });
  }, [dishes, query, kind]);
  const groups = useMemo(() => {
    const map = new Map<string, Dish[]>();
    visible.forEach((dish) => {
      const list = map.get(dish.category) ?? [];
      list.push(dish);
      map.set(dish.category, list);
    });
    const order = (data?.categories ?? []).filter((item) => Number(item.active ?? 1) === 1).map((item) => item.name);
    return [...map.entries()].sort((a, b) => {
      const left = order.indexOf(a[0]);
      const right = order.indexOf(b[0]);
      return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
    });
  }, [visible, data?.categories]);
  const categories = useMemo(() => {
    const present = new Set(dishes.map((row) => row.category));
    const named = (data?.categories ?? []).filter((item) => Number(item.active ?? 1) === 1 && present.has(item.name)).map((item) => item.name);
    const extras = [...present].filter((name) => !named.includes(name));
    return [{ id: 'all', label: 'Catégorie' }, ...named.concat(extras).map((item) => ({ id: item, label: item }))];
  }, [dishes, data?.categories]);

  const lines = dishes.filter((dish) => (cart[dish.id] || 0) > 0).map((dish) => ({ dish, qty: cart[dish.id] }));
  const cartTotal = lines.reduce((sum, line) => sum + line.qty * Number(line.dish.price || 0), 0);
  const cartCount = lines.reduce((sum, line) => sum + line.qty, 0);
  const historyRows = useMemo<HistorySale[]>(() => (data?.orders ?? []).map((row) => ({
    id: row.id,
    ref: `CMD-${String(row.id).padStart(5, '0')}`,
    at: row.at || '',
    seller: row.seller || row.user_email || 'Restaurant',
    total: Number(row.total || 0),
    pay: row.pay === 'note' ? 'Sur la note' : 'Espèces',
    status: ORDER_STATUS[row.status || ''] || row.status || 'Reçue',
    guest: row.guest_name || '',
    room: row.room_number || '',
    table: row.table_number || '',
    items: (row.items ?? []).map((item) => ({ name: item.name, qty: Number(item.qty || 0), price: Number(item.price || 0) })),
  })), [data?.orders]);
  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && !allowed) return <Redirect href="/home" />;

  function add(dish: Dish) {
    const next = (cart[dish.id] || 0) + 1;
    if (next > Number(dish.stock ?? 0)) return;
    setCart({ ...cart, [dish.id]: next });
  }

  function applyRoom(value: string) {
    setGuestRoom(value);
    const needle = value.trim();
    const stay = occupants.find((row) => String(row.room_number || '').trim() === needle)
      || payers.find((row) => String(row.room_number || '').trim() === needle && row.stay_status === 'en_cours')
      || payers.find((row) => String(row.room_number || '').trim() === needle);
    if (!needle || !stay) {
      if (!needle) setStayId(null);
      return;
    }
    if ('guest_name' in stay) {
      setStayId(stay.reservation_id);
      setGuestName(stay.guest_name);
      setGuestPhone(stay.guest_phone || '');
      return;
    }
    setStayId(stay.reservation_id || null);
    setGuestName(stay.full_name);
    setGuestPhone(stay.phone || '');
  }

  async function sell() {
    if (!token || saving || !lines.length) return;
    const name = guestName.trim();
    const room = guestRoom.trim();
    const payer = payers.find((row) => room && String(row.room_number) === room);
    const reservationId = occupant?.reservation_id || payer?.reservation_id || stayId;
    if (name.length < 2) {
      setFormError('Indiquez le nom du client.');
      return;
    }
    if (onAccount && !reservationId) {
      setFormError('Cette chambre n’a pas d’occupant actuel. Le montant ne peut pas être noté.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'restaurant/sale', {
        mode: onAccount ? 'chambre' : 'salle',
        reservation_id: onAccount ? reservationId : undefined,
        room_number: room || undefined,
        table_number: tableNumber.trim() || undefined,
        guest_name: name,
        guest_phone: guestPhone.trim(),
        items: lines.map((line) => ({ id: line.dish.id, qty: line.qty })),
      });
      setCart({});
      setCartOpen(false);
      setStayId(null);
      setGuestName('');
      setGuestPhone('');
      setGuestRoom('');
      setTableNumber('');
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Vente impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <HotelShell
      title="Vente"
      loading={loading && !data}
      error={error}
      right={
        <View style={styles.headBtns}>
          <GoldBtn compact icon="time" label="Historique" variant="ghost" onPress={() => setHistoryOpen(true)} />
          <GoldBtn compact icon="cart" label={cartCount ? `Panier ${cartCount}` : 'Panier'} onPress={() => setCartOpen(true)} />
        </View>
      }>
      <FilterBar query={query} onQuery={setQuery} queryPlaceholder="Rechercher un plat ou une boisson..." status={kind} onStatus={setKind} statuses={categories} />
      {groups.map(([category, list]) => (
        <View key={category} style={styles.section}>
          <Text style={styles.sectionTitle}>{category}</Text>
          <View style={styles.grid}>
            {list.map((dish) => {
              const inCart = cart[dish.id] || 0;
              const empty = Number(dish.stock ?? 0) <= 0;
              const drink = drinkCats.has(String(dish.category || '').trim().toLowerCase());
              return (
                <Pressable key={dish.id} disabled={empty} onPress={() => add(dish)} style={[styles.card, { width: cols === 1 ? '100%' : cols === 2 ? '48%' : '31%' }, empty && styles.off, inCart ? styles.on : null]}>
                  {dish.photo ? <Image source={{ uri: dish.photo }} style={styles.photo} contentFit="cover" /> : <View style={styles.photoEmpty}><AppIcon name={drink ? 'coffee' : 'restaurant'} size={22} color={Palette.gold} /></View>}
                  <View style={styles.copy}>
                    <Text style={styles.name} numberOfLines={1}>{dish.name}</Text>
                    <Text style={styles.meta}>{empty ? 'Rupture' : `${dish.stock ?? 0} en stock`} · {money(dish.price)}</Text>
                  </View>
                  {inCart ? <Text style={styles.badge}>{inCart}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {!visible.length ? <Text style={styles.empty}>Aucun produit ne correspond.</Text> : null}
      <SaleHistory visible={historyOpen} rows={historyRows} onClose={() => setHistoryOpen(false)} />

      <Modal visible={cartOpen} transparent animationType="fade" onRequestClose={() => setCartOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.fill} onPress={() => setCartOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.row}>
              <Text style={styles.sheetTitle}>Panier</Text>
              <GoldBtn compact icon="x-circle" label="Fermer" variant="ghost" onPress={() => setCartOpen(false)} />
            </View>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.sheetBody}>
              {lines.map((line) => (
                <View key={line.dish.id} style={styles.row}>
                  <View style={styles.copy}>
                    <Text style={styles.name}>{line.dish.name}</Text>
                    <Text style={styles.meta}>{money(line.qty * Number(line.dish.price))}</Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable onPress={() => setCart({ ...cart, [line.dish.id]: Math.max(0, line.qty - 1) })} style={styles.step}><Text style={styles.stepText}>−</Text></Pressable>
                    <Text style={styles.stepQty}>{line.qty}</Text>
                    <Pressable onPress={() => add(line.dish)} style={styles.step}><Text style={styles.stepText}>+</Text></Pressable>
                  </View>
                </View>
              ))}
              {!lines.length ? <Text style={styles.empty}>Touchez un plat pour l’ajouter.</Text> : null}
              <View style={styles.modeRow}>
                <Pressable onPress={() => setOnAccount(false)} style={[styles.mode, !onAccount && styles.modeOn]}><Text style={styles.modeText}>Encaisser</Text></Pressable>
                <Pressable onPress={() => setOnAccount(true)} style={[styles.mode, onAccount && styles.modeOn]}><Text style={styles.modeText}>Sur la note</Text></Pressable>
              </View>
              <TextInput value={guestName} onChangeText={setGuestName} placeholder="Nom du client" placeholderTextColor="rgba(20,22,34,0.45)" style={styles.input} />
              <TextInput value={guestPhone} onChangeText={setGuestPhone} placeholder="Téléphone" placeholderTextColor="rgba(20,22,34,0.45)" keyboardType="phone-pad" style={styles.input} />
              <TextInput value={guestRoom} onChangeText={applyRoom} placeholder="Numéro de chambre" placeholderTextColor="rgba(20,22,34,0.45)" style={styles.input} />
              {occupant ? (
                <View style={styles.occupant}>
                  <Text style={styles.name}>Occupant actuel · Ch. {occupant.room_number}</Text>
                  <Text style={styles.meta}>{occupant.guest_name}{occupant.guest_phone ? ` · ${occupant.guest_phone}` : ''}</Text>
                </View>
              ) : guestRoom.trim() ? (
                <Text style={styles.empty}>Aucun occupant actuel pour cette chambre.</Text>
              ) : null}
              <TextInput value={tableNumber} onChangeText={setTableNumber} placeholder="Numéro de table (sur place)" placeholderTextColor="rgba(20,22,34,0.45)" style={styles.input} />
              {onAccount ? (
                <View style={styles.clientBox}>
                  <TextInput value={clientQuery} onChangeText={setClientQuery} placeholder="Rechercher un client..." placeholderTextColor="rgba(20,22,34,0.45)" style={styles.input} />
                  <View style={styles.clientHead}>
                    <Text style={[styles.clientCell, styles.clientName, styles.clientHeadText]}>Client</Text>
                    <Text style={[styles.clientCell, styles.clientRoom, styles.clientHeadText]}>Chambre</Text>
                    <Text style={[styles.clientCell, styles.clientPhone, styles.clientHeadText]}>Téléphone</Text>
                  </View>
                  {shownPayers.map((row, index) => {
                    const active = stayId === row.reservation_id && !!row.reservation_id;
                    return (
                      <Pressable key={row.id} onPress={() => { setStayId(row.reservation_id || null); setGuestName(row.full_name); setGuestPhone(row.phone || ''); setGuestRoom(row.room_number ? String(row.room_number) : ''); }} style={[styles.clientRow, index % 2 ? styles.clientAlt : null, active && styles.pickOn]}>
                        <View style={[styles.clientCell, styles.clientName]}>
                          <Text style={styles.name} numberOfLines={1}>{row.full_name}</Text>
                          <Text style={styles.meta} numberOfLines={1}>{row.email}</Text>
                        </View>
                        <Text style={[styles.clientCell, styles.clientRoom, styles.name]}>{row.room_number ? `Ch. ${row.room_number}` : 'Sans chambre'}</Text>
                        <Text style={[styles.clientCell, styles.clientPhone, styles.meta]} numberOfLines={1}>{row.phone || '—'}</Text>
                      </Pressable>
                    );
                  })}
                  {!shownPayers.length ? <Text style={styles.empty}>Aucun client ne correspond.</Text> : null}
                </View>
              ) : null}
              {formError ? <Text style={styles.err}>{formError}</Text> : null}
              <View style={styles.row}>
                <Text style={styles.total}>{money(cartTotal)}</Text>
                <GoldBtn compact icon={onAccount ? 'bed' : 'wallet'} label={saving ? 'Enregistrement…' : onAccount ? 'Noter · plus tard' : 'Encaisser'} onPress={() => void sell()} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </HotelShell>
  );
}

const styles = StyleSheet.create({
  headBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  section: { gap: 8 },
  sectionTitle: { color: Palette.ink, fontWeight: '800', fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(20,22,34,0.1)', backgroundColor: Palette.white, overflow: 'hidden' },
  on: { borderColor: Palette.gold, borderBottomWidth: 3, borderBottomColor: Palette.ink },
  off: { opacity: 0.45 },
  photo: { width: 64, height: 64, borderRadius: 12 },
  photoEmpty: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,22,34,0.04)' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  name: { color: Palette.ink, fontWeight: '800' },
  meta: { color: Palette.ink, opacity: 0.65, fontSize: 12 },
  badge: { minWidth: 24, height: 24, borderRadius: 8, textAlign: 'center', textAlignVertical: 'center', backgroundColor: Palette.ink, color: Palette.gold, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 6 },
  empty: { color: Palette.ink, opacity: 0.65 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(20,22,34,0.28)', padding: 16 },
  fill: { ...StyleSheet.absoluteFill },
  sheet: { width: '100%', maxWidth: 640, maxHeight: '86%', gap: 10, padding: 16, borderRadius: Radius.card, backgroundColor: Palette.white, borderWidth: 1, borderColor: Palette.gold },
  input: { borderWidth: 1, borderColor: 'rgba(20,22,34,0.14)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: Palette.ink },
  clientBox: { gap: 0, borderWidth: 1, borderColor: 'rgba(20,22,34,0.08)', borderRadius: 12, overflow: 'hidden' },
  clientHead: { flexDirection: 'row', backgroundColor: 'rgba(212,175,55,0.16)', paddingVertical: 8, paddingHorizontal: 8 },
  clientHeadText: { fontSize: 11, fontWeight: '800', opacity: 0.7 },
  clientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8 },
  clientAlt: { backgroundColor: 'rgba(20,22,34,0.03)' },
  clientCell: { paddingRight: 8 },
  clientName: { flex: 1.4, minWidth: 0 },
  clientRoom: { width: 110 },
  clientPhone: { width: 110 },
  sheetTitle: { color: Palette.ink, fontWeight: '800', fontSize: 18, flex: 1 },
  scroll: { maxHeight: 420 },
  sheetBody: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Palette.gold, borderRadius: 10, overflow: 'hidden' },
  step: { width: 32, height: 32, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: Palette.ink, fontWeight: '800' },
  stepQty: { minWidth: 28, textAlign: 'center', color: Palette.ink, fontWeight: '800' },
  modeRow: { flexDirection: 'row', gap: 8 },
  mode: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(20,22,34,0.12)' },
  modeOn: { backgroundColor: Palette.gold, borderColor: Palette.gold },
  modeText: { color: Palette.ink, fontWeight: '800' },
  picks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pick: { minWidth: 120, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(20,22,34,0.12)' },
  pickOn: { borderColor: Palette.gold, backgroundColor: 'rgba(212,175,55,0.18)' },
  total: { color: Palette.ink, fontWeight: '800', fontSize: 18 },
  err: { color: Palette.ink, fontWeight: '700', backgroundColor: 'rgba(212,175,55,0.2)', padding: 8, borderRadius: 10 },
  occupant: { gap: 2, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Palette.gold, backgroundColor: 'rgba(212,175,55,0.16)' },
  ticket: { gap: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: Palette.gold },
});
