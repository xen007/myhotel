import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/box-icon';
import { FilterBar } from '@/components/hotel/filter-bar';
import { HotelShell } from '@/components/hotel/hotel-shell';
import { ConfirmDialog, GoldBtn } from '@/components/hotel/kit';
import { Breakpoints, Palette, Radius } from '@/constants/theme';
import { usePms } from '@/hooks/use-pms';
import { pmsPost } from '@/lib/api';
import { money, prettyStamp } from '@/lib/format';

type Good = {
  id: number;
  name: string;
  kind: string;
  unit: string;
  stock: number;
  min_stock: number;
  cost: number;
  price: number;
  photo?: string | null;
};

type Move = {
  id: number;
  good_name: string;
  qty: number;
  direction: string;
  taken_by?: string | null;
  note?: string | null;
  at: string;
};

type Payload = { goods?: Good[]; moves?: Move[] };

const EMPTY = { id: 0, name: '', kind: 'matiere', unit: 'kg', stock: '0', min_stock: '0', cost: '', price: '', photo: '' };

async function toStoredUri(asset: ImagePicker.ImagePickerAsset) {
  if (asset.base64) return `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
  if (asset.uri.startsWith('data:')) return asset.uri;
  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Lecture impossible.'));
      reader.readAsDataURL(blob);
    });
  }
  return asset.uri;
}

export default function KitchenScreen() {
  const { data, error, loading, reload, token, user, ready } = usePms<Payload>('restaurant');
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [move, setMove] = useState<{ good: Good; direction: 'entree' | 'sortie'; qty: string; taken_by: string; note: string } | null>(null);
  const [pending, setPending] = useState<Good | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const allowed = user?.role === 'restaurant' || user?.role === 'manager' || user?.role === 'owner';
  const isDesktop = width >= Breakpoints.desktop;
  const goods = data?.goods ?? [];
  const moves = data?.moves ?? [];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return goods.filter((row) => {
      const qty = Number(row.stock);
      const min = Number(row.min_stock);
      if (status === 'matiere' && row.kind !== 'matiere') return false;
      if (status === 'prepare' && row.kind !== 'prepare') return false;
      if (status === 'rupture' && qty > 0) return false;
      if (status === 'low' && (qty <= 0 || qty > min)) return false;
      if (needle && !row.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [goods, query, status]);

  if (ready && !user) return <Redirect href="/welcome" />;
  if (ready && user && !allowed) return <Redirect href="/home" />;

  function openEdit(row: Good) {
    setFormError(null);
    setForm({
      id: row.id,
      name: row.name,
      kind: row.kind,
      unit: row.unit,
      stock: String(row.stock),
      min_stock: String(row.min_stock),
      cost: String(row.cost || ''),
      price: String(row.price || ''),
      photo: row.photo || '',
    });
  }

  async function pickPhoto() {
    if (!form) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
    if (result.canceled || !result.assets[0]) return;
    const photo = await toStoredUri(result.assets[0]);
    setForm({ ...form, photo });
  }

  async function save() {
    if (!token || !form || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'restaurant/good', {
        id: form.id || undefined,
        name: form.name,
        kind: form.kind,
        unit: form.unit,
        stock: Number(form.stock),
        min_stock: Number(form.min_stock),
        cost: Number(form.cost || 0),
        price: Number(form.price || 0),
        photo: form.photo,
      });
      setForm(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function sendMove() {
    if (!token || !move || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await pmsPost(token, 'restaurant/move', {
        id: move.good.id,
        direction: move.direction,
        qty: Number(move.qty),
        taken_by: move.taken_by,
        note: move.note,
      });
      setMove(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Mouvement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!token || !pending) return;
    await pmsPost(token, 'restaurant/good/delete', { id: pending.id });
    setPending(null);
    await reload();
  }

  return (
    <HotelShell
      title="Gestion stock"
      loading={loading && !data}
      error={error}
      right={<GoldBtn compact icon="plus" label="Ajouter" onPress={() => { setFormError(null); setForm({ ...EMPTY }); }} />}>
      <FilterBar
        query={query}
        onQuery={setQuery}
        queryPlaceholder="Rechercher un produit..."
        status={status}
        onStatus={setStatus}
        statuses={[
          { id: 'all', label: 'Tous' },
          { id: 'matiere', label: 'Matières' },
          { id: 'prepare', label: 'Préparés' },
          { id: 'low', label: 'Stock bas' },
          { id: 'rupture', label: 'Rupture' },
        ]}
      />
      <ScrollView horizontal={!isDesktop} showsHorizontalScrollIndicator={!isDesktop}>
        <View style={[styles.table, { minWidth: isDesktop ? '100%' : 860 }]}>
          <View style={[styles.tr, styles.th]}>
            <Text style={[styles.td, styles.colName, styles.thText]}>Produit</Text>
            <Text style={[styles.td, styles.colKind, styles.thText]}>Type</Text>
            <Text style={[styles.td, styles.colNum, styles.thText]}>Stock</Text>
            <Text style={[styles.td, styles.colNum, styles.thText]}>Min</Text>
            <Text style={[styles.td, styles.colPrice, styles.thText]}>Achat</Text>
            <View style={[styles.td, styles.colAct]} />
          </View>
          {visible.map((row, index) => {
            const qty = Number(row.stock);
            const low = qty <= Number(row.min_stock);
            return (
              <View key={row.id} style={[styles.tr, index % 2 ? styles.alt : null, qty <= 0 && styles.urgent]}>
                <View style={[styles.td, styles.colName, styles.nameCell]}>
                  {row.photo ? <Image source={{ uri: row.photo }} style={styles.thumb} contentFit="cover" /> : <View style={styles.thumb}><AppIcon name="cabinet" size={16} color={Palette.ink} /></View>}
                  <View style={styles.copy}>
                    <Text style={styles.name} numberOfLines={1}>{row.name}</Text>
                    <Text style={styles.meta}>{row.unit}</Text>
                  </View>
                </View>
                <Text style={[styles.td, styles.colKind]}>{row.kind === 'prepare' ? 'Menu préparé' : 'Matière'}</Text>
                <Text style={[styles.td, styles.colNum, low && styles.low]}>{qty}</Text>
                <Text style={[styles.td, styles.colNum]}>{row.min_stock}</Text>
                <Text style={[styles.td, styles.colPrice]}>{money(row.cost)}</Text>
                <View style={[styles.td, styles.colAct, styles.actions]}>
                  <Pressable style={styles.iconBtn} onPress={() => { setFormError(null); setMove({ good: row, direction: 'entree', qty: '1', taken_by: '', note: 'Marché' }); }}>
                    <AppIcon name="plus" size={15} color={Palette.ink} />
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={() => { setFormError(null); setMove({ good: row, direction: 'sortie', qty: '1', taken_by: '', note: '' }); }}>
                    <AppIcon name="log-out" size={15} color={Palette.ink} />
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={() => openEdit(row)}>
                    <AppIcon name="edit" size={15} color={Palette.ink} />
                  </Pressable>
                  <Pressable style={[styles.iconBtn, styles.iconInk]} onPress={() => setPending(row)}>
                    <AppIcon name="trash" size={15} color={Palette.white} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      {!visible.length ? <Text style={styles.empty}>Aucun produit ne correspond.</Text> : null}
      {moves.length ? (
        <View style={styles.moves}>
          <Text style={styles.movesTitle}>Derniers mouvements</Text>
          {moves.slice(0, 8).map((row) => (
            <Text key={row.id} style={styles.moveLine}>
              {row.direction === 'entree' ? 'Entrée' : 'Sortie'} · {row.good_name} · {row.qty} · {row.taken_by || row.note || '—'} · {prettyStamp(row.at)}
            </Text>
          ))}
        </View>
      ) : null}

      <Modal visible={!!form} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <View style={styles.overlay}>
          <Pressable style={styles.fill} onPress={() => setForm(null)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{form?.id ? 'Modifier le produit' : 'Nouveau produit'}</Text>
            <View style={styles.kinds}>
              <GoldBtn compact label="Matière première" variant={form?.kind === 'matiere' ? 'gold' : 'ghost'} onPress={() => form && setForm({ ...form, kind: 'matiere' })} />
              <GoldBtn compact label="Menu préparé" variant={form?.kind === 'prepare' ? 'gold' : 'ghost'} onPress={() => form && setForm({ ...form, kind: 'prepare' })} />
            </View>
            <Pressable onPress={() => void pickPhoto()} style={styles.picker}>
              {form?.photo ? <Image source={{ uri: form.photo }} style={styles.preview} contentFit="cover" /> : <Text style={styles.meta}>Photo</Text>}
            </Pressable>
            <TextInput value={form?.name} onChangeText={(name) => form && setForm({ ...form, name })} placeholder="Nom" style={styles.input} />
            <TextInput value={form?.unit} onChangeText={(unit) => form && setForm({ ...form, unit })} placeholder="Unité (kg, L, pièce)" style={styles.input} />
            <TextInput value={form?.stock} onChangeText={(stock) => form && setForm({ ...form, stock })} placeholder="Stock" keyboardType="numeric" style={styles.input} />
            <TextInput value={form?.min_stock} onChangeText={(min_stock) => form && setForm({ ...form, min_stock })} placeholder="Seuil" keyboardType="numeric" style={styles.input} />
            <TextInput value={form?.cost} onChangeText={(cost) => form && setForm({ ...form, cost })} placeholder="Prix d’achat" keyboardType="numeric" style={styles.input} />
            {formError && form ? <Text style={styles.err}>{formError}</Text> : null}
            <View style={styles.kinds}>
              <GoldBtn compact label={saving ? 'Enregistrement…' : 'Enregistrer'} onPress={() => void save()} />
              <GoldBtn compact variant="ghost" label="Fermer" onPress={() => setForm(null)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!move} transparent animationType="fade" onRequestClose={() => setMove(null)}>
        <View style={styles.overlay}>
          <Pressable style={styles.fill} onPress={() => setMove(null)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{move?.direction === 'entree' ? 'Entrée · marché' : 'Sortie interne'} · {move?.good.name}</Text>
            <TextInput value={move?.qty} onChangeText={(qty) => move && setMove({ ...move, qty })} placeholder="Quantité" keyboardType="numeric" style={styles.input} />
            {move?.direction === 'sortie' ? (
              <TextInput value={move.taken_by} onChangeText={(taken_by) => setMove({ ...move, taken_by })} placeholder="Remis à" style={styles.input} />
            ) : null}
            <TextInput value={move?.note} onChangeText={(note) => move && setMove({ ...move, note })} placeholder="Note" style={styles.input} />
            {formError && move ? <Text style={styles.err}>{formError}</Text> : null}
            <View style={styles.kinds}>
              <GoldBtn compact icon={move?.direction === 'entree' ? 'plus' : 'log-out'} label={saving ? 'Enregistrement…' : 'Valider'} onPress={() => void sendMove()} />
              <GoldBtn compact variant="ghost" label="Fermer" onPress={() => setMove(null)} />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!pending}
        title="Retirer le produit"
        message={pending ? `${pending.name} sort du stock restaurant.` : ''}
        confirmLabel="Supprimer"
        onCancel={() => setPending(null)}
        onConfirm={() => void remove()}
      />
    </HotelShell>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: 1, borderColor: 'rgba(20,22,34,0.08)', borderRadius: 16, overflow: 'hidden', backgroundColor: Palette.white },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(20,22,34,0.08)' },
  th: { backgroundColor: 'rgba(212,175,55,0.16)' },
  alt: { backgroundColor: 'rgba(20,22,34,0.02)' },
  urgent: { backgroundColor: 'rgba(212,175,55,0.12)' },
  td: { paddingHorizontal: 10, paddingVertical: 8, color: Palette.ink },
  thText: { fontWeight: '800', fontSize: 12 },
  colName: { flex: 1.6, minWidth: 200 },
  colKind: { width: 130 },
  colNum: { width: 72, textAlign: 'right', fontWeight: '700' },
  colPrice: { width: 110, textAlign: 'right', fontWeight: '700' },
  colAct: { width: 168, alignItems: 'flex-end' },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,22,34,0.04)' },
  copy: { flex: 1, minWidth: 0 },
  name: { color: Palette.ink, fontWeight: '800' },
  meta: { color: Palette.ink, opacity: 0.55, fontSize: 11 },
  low: { color: Palette.ink, backgroundColor: Palette.gold, borderRadius: 8, overflow: 'hidden' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  iconBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center' },
  iconInk: { backgroundColor: Palette.ink },
  empty: { color: Palette.ink, opacity: 0.65, marginTop: 8 },
  moves: { gap: 4, marginTop: 8 },
  movesTitle: { color: Palette.ink, fontWeight: '800' },
  moveLine: { color: Palette.ink, fontSize: 13 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(20,22,34,0.28)', padding: 16 },
  fill: { ...StyleSheet.absoluteFill },
  sheet: { width: '100%', maxWidth: 440, gap: 8, padding: 16, borderRadius: Radius.card, backgroundColor: Palette.white, borderWidth: 1, borderColor: Palette.gold },
  sheetTitle: { color: Palette.ink, fontWeight: '800', fontSize: 18 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  picker: { height: 90, borderRadius: 12, borderWidth: 1, borderColor: Palette.gold, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  preview: { ...StyleSheet.absoluteFill },
  input: { borderWidth: 1, borderColor: 'rgba(20,22,34,0.14)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: Palette.ink },
  err: { color: Palette.ink, fontWeight: '700', backgroundColor: 'rgba(212,175,55,0.2)', padding: 8, borderRadius: 10 },
});
